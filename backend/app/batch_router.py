"""Batch read & export endpoints.

Light by design (no torch/paddleocr imports) so it stays fast to import and unit-testable
via FastAPI TestClient. The batch UPLOAD + processing endpoint is wired in Phase 2 alongside
the extraction core; these read/download endpoints work off the DB + exporters today.
"""
import io
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app import batch_service, exporters
from app.auth import get_current_user
from app.database import Document, User, get_db

router = APIRouter(prefix="/api/v1/batch", tags=["batch"])


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
