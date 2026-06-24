"""Export batch extraction results to CSV and Excel.

Pure functions over plain record dicts (no DB/FastAPI) so they are easy to unit-test.
A record is one bill:
    {
      "filename": str, "status": str,
      "vendor": str|None, "date": str|None, "total": str|float|None,
      "items": [{"description","qty","unit_price","line_total"}, ...],
    }
"""
import csv
import io
from typing import Any, Dict, List

SUMMARY_HEADERS = ["File", "Vendor", "Date", "Total", "Items", "Status"]
ITEM_HEADERS = ["File", "Description", "Qty", "Unit Price", "Line Total"]


def _summary_row(rec: Dict[str, Any]) -> list:
    items = rec.get("items") or []
    total = rec.get("total")
    return [
        rec.get("filename", ""),
        rec.get("vendor") or "",
        rec.get("date") or "",
        total if total is not None else "",
        len(items),
        rec.get("status", ""),
    ]


def batch_to_csv(records: List[Dict[str, Any]]) -> bytes:
    """One row per bill (summary). UTF-8 with BOM so Excel opens it cleanly."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(SUMMARY_HEADERS)
    for rec in records:
        writer.writerow(_summary_row(rec))
    return buf.getvalue().encode("utf-8-sig")


def batch_to_excel(records: List[Dict[str, Any]]) -> bytes:
    """Two sheets: 'Summary' (one row/bill) + 'Line Items' (one row/item). Returns .xlsx bytes."""
    from openpyxl import Workbook

    wb = Workbook()
    summary = wb.active
    summary.title = "Summary"
    summary.append(SUMMARY_HEADERS)
    for rec in records:
        summary.append(_summary_row(rec))

    items_ws = wb.create_sheet("Line Items")
    items_ws.append(ITEM_HEADERS)
    for rec in records:
        fname = rec.get("filename", "")
        for it in (rec.get("items") or []):
            items_ws.append([
                fname,
                it.get("description", ""),
                it.get("qty", ""),
                it.get("unit_price", ""),
                it.get("line_total", ""),
            ])

    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()
