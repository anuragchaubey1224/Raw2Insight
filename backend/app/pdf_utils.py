"""Lightweight PDF helpers for the batch feature.

Counting pages must be cheap (no rendering) so an upload can be validated against the
per-batch bill cap before any heavy OCR/detection work begins.
"""
import io


def count_pdf_pages(data: bytes) -> int:
    """Return the number of pages in a PDF given its raw bytes, without rendering.

    Raises ValueError if the bytes are not a readable PDF.
    """
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    try:
        return len(PdfReader(io.BytesIO(data)).pages)
    except PdfReadError as e:
        raise ValueError(f"Not a readable PDF: {e}") from e
