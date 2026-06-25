"""Batch read & export endpoints.

Light by design (no torch/paddleocr imports) so it stays fast to import and unit-testable
via FastAPI TestClient. The batch UPLOAD + processing endpoint is wired in Phase 2 alongside
the extraction core; these read/download endpoints work off the DB + exporters today.
"""
import io
import json
import logging
import uuid
from pathlib import Path
from typing import List

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app import batch_service, exporters, pdf_utils
from app.auth import get_current_user
from app.config import get_settings
from app.database import Document, User, get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/batch", tags=["batch"])

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf"}
_UPLOAD_ROOT = Path(__file__).resolve().parent.parent / "tmp" / "uploads"


def _records_from_documents(docs) -> list:
    """Flatten Document rows into export/display records (one per bill)."""
    records = []
    for d in docs:
        data = {}
        if d.extracted_data:
            try:
                data = json.loads(d.extracted_data) if isinstance(d.extracted_data, str) else d.extracted_data
            except Exception:
                data = {}
        records.append({
            "filename": d.filename,
            "status": d.status,
            "vendor": data.get("vendor") or d.vendor,
            "date": data.get("date") or d.date,
            "total": data.get("total") if data.get("total") is not None else d.total_amount,
            "items": data.get("items") or [],
            "confidence": d.confidence,
        })
    return records


def _owned_batch(db: Session, batch_id: str, user: User):
    batch = batch_service.get_batch(db, batch_id)
    if batch is None or batch.user_id != user.id:
        raise HTTPException(status_code=404, detail="Batch not found")
    return batch


@router.get("/{batch_id}/status")
def batch_status(batch_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    b = _owned_batch(db, batch_id, user)
    return {
        "batch_id": b.batch_id, "status": b.status, "engine": b.engine,
        "total": b.total_count, "done": b.done_count, "failed": b.failed_count,
    }


@router.get("/{batch_id}/results")
def batch_results(batch_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    b = _owned_batch(db, batch_id, user)
    docs = batch_service.get_batch_documents(db, batch_id)
    return {"batch_id": b.batch_id, "status": b.status, "rows": _records_from_documents(docs)}


@router.get("/{batch_id}/download")
def batch_download(
    batch_id: str,
    format: str = Query("csv", pattern="^(csv|xlsx)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _owned_batch(db, batch_id, user)
    records = _records_from_documents(batch_service.get_batch_documents(db, batch_id))
    if format == "xlsx":
        data = exporters.batch_to_excel(records)
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = f"batch_{batch_id}.xlsx"
    else:
        data = exporters.batch_to_csv(records)
        media = "text/csv"
        filename = f"batch_{batch_id}.csv"
    return StreamingResponse(
        io.BytesIO(data),
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# --------------------------------------------------------------------------- #
# Upload + background processing (the batch's write path)
# --------------------------------------------------------------------------- #
def _add_document(db: Session, user: User, batch_id: str, job_id: str, filename: str) -> None:
    db.add(Document(
        user_id=user.id, job_id=job_id, filename=filename,
        status="processing", batch_id=batch_id,
    ))


def _prepare_bills(db, user, batch_id, image_files, pdf_files):
    """Materialise every bill to disk (one job dir each) + create its Document row.

    Images map 1:1 to a bill; each PDF page becomes its own bill (rendered to PNG). Returns a list
    of (job_id, image_path, filename) for the worker.
    """
    bills = []
    for filename, ext, data in image_files:
        job_id = str(uuid.uuid4())
        job_dir = _UPLOAD_ROOT / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        img_path = job_dir / f"raw_input{ext}"
        img_path.write_bytes(data)
        _add_document(db, user, batch_id, job_id, filename)
        bills.append((job_id, str(img_path), filename))

    for filename, data in pdf_files:
        from pdf2image import convert_from_bytes  # heavy + poppler; only when a PDF is present
        pages = convert_from_bytes(data, dpi=200)
        for i, page in enumerate(pages):
            job_id = str(uuid.uuid4())
            job_dir = _UPLOAD_ROOT / job_id
            job_dir.mkdir(parents=True, exist_ok=True)
            img_path = job_dir / "raw_input.png"
            page.save(str(img_path), "PNG")
            label = f"{filename} (page {i + 1})"
            _add_document(db, user, batch_id, job_id, label)
            bills.append((job_id, str(img_path), label))

    db.commit()
    return bills


def _run_batch(batch_id: str, bills, engine: str) -> None:
    """Sequential worker with per-bill failure isolation: one bad slip never fails the batch."""
    from app.database import SessionLocal
    from app.field_extractor import extract_business_schema

    for job_id, image_path, filename in bills:
        db = SessionLocal()
        try:
            schema, _used = extract_business_schema(image_path)
            if schema is None:  # detector found too little — store an empty record, don't crash
                schema = {"vendor": "", "date": None, "items": [], "total": 0.0,
                          "tax": 0.0, "item_count": 0, "confidence": 0.0, "engine": "local"}
            doc = db.query(Document).filter(Document.job_id == job_id).first()
            if doc:
                doc.extracted_data = json.dumps(schema, ensure_ascii=False)
                doc.vendor = schema.get("vendor") or ""
                doc.date = schema.get("date")
                doc.total_amount = str(schema.get("total") or "")
                doc.item_count = schema.get("item_count", 0)
                doc.confidence = schema.get("confidence")
                doc.status = "completed"
                db.commit()
            batch_service.record_bill_result(db, batch_id, success=True)
        except Exception as e:
            logger.error(f"Batch {batch_id}: bill {filename} failed: {e}")
            try:
                doc = db.query(Document).filter(Document.job_id == job_id).first()
                if doc:
                    doc.status = "failed"
                    doc.error_message = str(e)[:500]
                    db.commit()
            except Exception:
                pass
            batch_service.record_bill_result(db, batch_id, success=False)
        finally:
            db.close()


@router.post("/upload")
async def batch_upload(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    engine: str = Form("local"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload up to MAX_BATCH_SIZE bills (images and/or PDF pages) and start processing.

    1 image = 1 bill; 1 PDF page = 1 bill (counts toward the cap). Processing runs in the
    background; poll GET /batch/{id}/status, then GET /batch/{id}/results.
    """
    settings = get_settings()

    image_files, pdf_files, pdf_page_counts = [], [], []
    for f in files:
        ext = Path(f.filename or "").suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext or '?'}")
        data = await f.read()
        if not data:
            raise HTTPException(status_code=400, detail=f"Empty file: {f.filename}")
        if ext == ".pdf":
            try:
                pdf_page_counts.append(pdf_utils.count_pdf_pages(data))
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
            pdf_files.append((f.filename, data))
        else:
            image_files.append((f.filename, ext, data))

    total_bills = batch_service.count_bills(len(image_files), pdf_page_counts)
    try:
        batch_service.enforce_batch_limit(total_bills, settings.max_batch_size)
    except batch_service.BatchSizeError as e:
        raise HTTPException(status_code=400, detail=str(e))

    batch = batch_service.create_batch(db, user.id, total_bills, engine)
    bills = _prepare_bills(db, user, batch.batch_id, image_files, pdf_files)
    background_tasks.add_task(_run_batch, batch.batch_id, bills, engine)

    return {
        "batch_id": batch.batch_id,
        "status": "processing",
        "total": total_bills,
        "engine": engine,
    }
