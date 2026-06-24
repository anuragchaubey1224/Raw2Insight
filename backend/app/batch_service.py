"""Batch processing service.

Pure helpers (count / limit / status) + DB operations for the batch feature.
Deliberately independent of FastAPI and app.config so it stays easy to unit-test;
callers pass the configured max batch size in explicitly.
"""
import uuid
from typing import List, Optional

from app.database import Batch, Document


class BatchSizeError(ValueError):
    """Raised when a batch has zero bills or exceeds the allowed maximum."""


# --------------------------------------------------------------------------- #
# Pure helpers (no DB, no config) — trivially unit-testable
# --------------------------------------------------------------------------- #
def count_bills(image_count: int, pdf_page_counts: Optional[List[int]] = None) -> int:
    """Total bills in a batch = standalone images + every PDF page (1 page = 1 bill)."""
    pages = sum(pdf_page_counts) if pdf_page_counts else 0
    return int(image_count) + int(pages)


def enforce_batch_limit(total_bills: int, max_size: int) -> None:
    """Validate the bill count against the configured maximum. Raises BatchSizeError."""
    if total_bills < 1:
        raise BatchSizeError("A batch must contain at least 1 bill.")
    if total_bills > max_size:
        raise BatchSizeError(f"Max {max_size} bills per batch (got {total_bills}).")


def compute_status(total: int, done: int, failed: int) -> str:
    """Aggregate batch status from per-bill counts."""
    done, failed = done or 0, failed or 0
    if done + failed < total:
        return "processing"
    if failed == 0:
        return "completed"
    if done == 0:
        return "failed"
    return "partial"


# --------------------------------------------------------------------------- #
# DB operations
# --------------------------------------------------------------------------- #
def create_batch(db, user_id: int, total_count: int, engine: str = "local") -> Batch:
    """Create a new batch row (status=processing, counts at zero)."""
    batch = Batch(
        batch_id=str(uuid.uuid4()),
        user_id=user_id,
        total_count=total_count,
        done_count=0,
        failed_count=0,
        status="processing",
        engine=engine,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch


def get_batch(db, batch_id: str) -> Optional[Batch]:
    return db.query(Batch).filter(Batch.batch_id == batch_id).first()


def get_batch_documents(db, batch_id: str) -> List[Document]:
    return db.query(Document).filter(Document.batch_id == batch_id).all()


def record_bill_result(db, batch_id: str, success: bool) -> Optional[Batch]:
    """Increment done/failed for one finished bill and recompute the batch status.

    Per-bill isolation: a failed bill bumps failed_count but never blocks the rest.
    Returns the updated Batch, or None if the batch_id is unknown.
    """
    batch = get_batch(db, batch_id)
    if batch is None:
        return None
    if success:
        batch.done_count = (batch.done_count or 0) + 1
    else:
        batch.failed_count = (batch.failed_count or 0) + 1
    batch.status = compute_status(batch.total_count, batch.done_count, batch.failed_count)
    db.commit()
    db.refresh(batch)
    return batch
