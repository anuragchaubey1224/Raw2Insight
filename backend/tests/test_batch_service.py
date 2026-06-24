"""Unit tests for app.batch_service (pure helpers + DB ops)."""
import os
import tempfile
import uuid

# Bind an isolated temp SQLite DB BEFORE importing app modules (engine binds at import time).
os.environ["ENVIRONMENT"] = "development"
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.NamedTemporaryFile(suffix='.db', delete=False).name}"

import pytest

from app import database
from app.database import User, Document
from app.batch_service import (
    count_bills,
    enforce_batch_limit,
    compute_status,
    BatchSizeError,
    create_batch,
    record_bill_result,
    get_batch_documents,
)


@pytest.fixture(scope="module", autouse=True)
def _init_db():
    database.init_db()


@pytest.fixture
def session():
    s = database.SessionLocal()
    yield s
    s.close()


@pytest.fixture
def user(session):
    u = User(email=f"{uuid.uuid4().hex[:8]}@test.com", password_hash="x")
    session.add(u)
    session.commit()
    session.refresh(u)
    return u


# ----------------------------- pure helpers ------------------------------ #
def test_count_bills():
    assert count_bills(3) == 3
    assert count_bills(2, [3, 4]) == 9      # 2 images + 7 pdf pages
    assert count_bills(0, [5]) == 5
    assert count_bills(0, None) == 0


def test_enforce_batch_limit_ok():
    enforce_batch_limit(1, 10)
    enforce_batch_limit(10, 10)


@pytest.mark.parametrize("n", [0, 11, 50])
def test_enforce_batch_limit_rejects(n):
    with pytest.raises(BatchSizeError):
        enforce_batch_limit(n, 10)


def test_compute_status():
    assert compute_status(5, 2, 0) == "processing"   # still in flight
    assert compute_status(5, 5, 0) == "completed"
    assert compute_status(5, 0, 5) == "failed"
    assert compute_status(5, 3, 2) == "partial"      # some ok, some failed


# ------------------------------- DB ops ---------------------------------- #
def test_create_and_track_batch(session, user):
    batch = create_batch(session, user.id, total_count=3, engine="local")
    assert batch.status == "processing"
    assert batch.total_count == 3 and batch.done_count == 0 and batch.failed_count == 0

    record_bill_result(session, batch.batch_id, success=True)
    record_bill_result(session, batch.batch_id, success=True)
    updated = record_bill_result(session, batch.batch_id, success=False)

    assert updated.done_count == 2 and updated.failed_count == 1
    assert updated.status == "partial"   # per-bill isolation: one fail != whole-batch fail


def test_record_unknown_batch_returns_none(session):
    assert record_bill_result(session, "does-not-exist", success=True) is None


def test_get_batch_documents(session, user):
    batch = create_batch(session, user.id, total_count=2)
    for i in range(2):
        session.add(Document(
            user_id=user.id, job_id=uuid.uuid4().hex,
            filename=f"f{i}.jpg", batch_id=batch.batch_id,
        ))
    session.commit()
    docs = get_batch_documents(session, batch.batch_id)
    assert len(docs) == 2
