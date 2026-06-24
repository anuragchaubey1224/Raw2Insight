"""Unit tests for app.exporters (CSV + Excel batch export)."""
import csv
import io

from openpyxl import load_workbook

from app.exporters import batch_to_csv, batch_to_excel

RECORDS = [
    {
        "filename": "a.jpg", "status": "completed", "vendor": "Cafe ABC",
        "date": "2026-06-20", "total": 450,
        "items": [{"description": "Tea", "qty": 2, "unit_price": 25, "line_total": 50}],
    },
    {
        "filename": "b.jpg", "status": "failed", "vendor": None,
        "date": None, "total": None, "items": [],
    },
]


def test_csv_header_and_rows():
    text = batch_to_csv(RECORDS).decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(text)))
    assert rows[0] == ["File", "Vendor", "Date", "Total", "Items", "Status"]
    assert rows[1][0] == "a.jpg" and rows[1][1] == "Cafe ABC"
    assert rows[1][4] == "1"          # a.jpg -> 1 line item
    assert rows[2][0] == "b.jpg" and rows[2][4] == "0"
    assert len(rows) == 3             # header + 2 bills


def test_csv_handles_none_fields():
    text = batch_to_csv(RECORDS).decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(text)))
    # failed bill with None vendor/date/total -> empty strings, never the literal "None"
    assert rows[2][1] == "" and rows[2][2] == "" and rows[2][3] == ""


def test_excel_two_sheets_and_data():
    wb = load_workbook(io.BytesIO(batch_to_excel(RECORDS)))
    assert wb.sheetnames == ["Summary", "Line Items"]

    summary = list(wb["Summary"].values)
    assert summary[0] == ("File", "Vendor", "Date", "Total", "Items", "Status")
    assert summary[1][0] == "a.jpg" and summary[1][4] == 1

    items = list(wb["Line Items"].values)
    assert items[0] == ("File", "Description", "Qty", "Unit Price", "Line Total")
    assert items[1][0] == "a.jpg" and items[1][1] == "Tea"
    assert len(items) == 2            # header + 1 line item (b.jpg contributes none)


def test_empty_batch():
    assert batch_to_csv([]).decode("utf-8-sig").strip() == "File,Vendor,Date,Total,Items,Status"
    wb = load_workbook(io.BytesIO(batch_to_excel([])))
    assert list(wb["Summary"].values)[0] == ("File", "Vendor", "Date", "Total", "Items", "Status")
