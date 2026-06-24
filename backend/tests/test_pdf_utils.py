"""Unit tests for app.pdf_utils.count_pdf_pages."""
import io

import pytest
from pypdf import PdfWriter

from app.pdf_utils import count_pdf_pages


def _make_pdf(n_pages: int) -> bytes:
    writer = PdfWriter()
    for _ in range(n_pages):
        writer.add_blank_page(width=72, height=72)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


@pytest.mark.parametrize("n", [1, 2, 5, 10])
def test_count_pdf_pages(n):
    assert count_pdf_pages(_make_pdf(n)) == n


def test_invalid_pdf_raises_value_error():
    with pytest.raises(ValueError):
        count_pdf_pages(b"this is not a pdf")
