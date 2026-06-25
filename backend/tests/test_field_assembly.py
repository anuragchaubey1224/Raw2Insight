"""Unit tests for app.field_assembly (detected fields -> structured record)."""
from app.field_assembly import parse_number, assemble


def test_parse_number():
    assert parse_number("$1,234.50") == 1234.50
    assert parse_number("O.99") == 0.99        # O -> 0
    assert parse_number("1l.5O") == 11.50      # l -> 1, O -> 0
    assert parse_number("12") == 12.0
    assert parse_number(None) is None
    assert parse_number("abc") is None


def test_assemble_headers():
    fields = [
        {"cls": "COMPANY", "bbox": [0, 0, 100, 20], "text": "Cafe ABC", "conf": 0.9},
        {"cls": "DATE", "bbox": [0, 20, 100, 40], "text": "2026-06-20", "conf": 0.8},
        {"cls": "TOTAL", "bbox": [0, 200, 100, 220], "text": "$309.75", "conf": 0.85},
    ]
    rec = assemble(fields)
    assert rec["vendor"] == "Cafe ABC"
    assert rec["date"] == "2026-06-20"
    assert rec["total"] == 309.75


def test_line_item_single_row_derives_unit_price():
    fields = [
        {"cls": "ITEM", "bbox": [0, 100, 80, 120], "text": "Tea", "conf": 0.9},
        {"cls": "QTY", "bbox": [80, 100, 100, 120], "text": "2", "conf": 0.9},
        {"cls": "LINE_TOTAL", "bbox": [100, 100, 140, 120], "text": "50", "conf": 0.9},
    ]
    rec = assemble(fields)
    assert len(rec["items"]) == 1
    it = rec["items"][0]
    assert it["description"] == "Tea" and it["qty"] == 2.0 and it["line_total"] == 50.0
    assert it["unit_price"] == 25.0   # derived: 50 / 2 (UNIT_PRICE class is unreliable)


def test_multiple_rows_grouped_by_y():
    fields = [
        {"cls": "ITEM", "bbox": [0, 100, 80, 120], "text": "Tea", "conf": 0.9},
        {"cls": "LINE_TOTAL", "bbox": [100, 100, 140, 120], "text": "50", "conf": 0.9},
        {"cls": "ITEM", "bbox": [0, 140, 80, 160], "text": "Coffee", "conf": 0.9},
        {"cls": "LINE_TOTAL", "bbox": [100, 140, 140, 160], "text": "80", "conf": 0.9},
    ]
    rec = assemble(fields)
    assert len(rec["items"]) == 2
    assert {it["description"] for it in rec["items"]} == {"Tea", "Coffee"}


def test_confidence_higher_when_math_consistent():
    fields = [
        {"cls": "ITEM", "bbox": [0, 100, 80, 120], "text": "Tea", "conf": 1.0},
        {"cls": "QTY", "bbox": [80, 100, 100, 120], "text": "2", "conf": 1.0},
        {"cls": "UNIT_PRICE", "bbox": [100, 100, 120, 120], "text": "25", "conf": 1.0},
        {"cls": "LINE_TOTAL", "bbox": [120, 100, 160, 120], "text": "50", "conf": 1.0},
    ]
    rec = assemble(fields)
    assert rec["items"][0]["unit_price"] == 25.0
    assert rec["confidence"] >= 0.9   # 2*25 == 50 (consistent) + high detector confidence


def test_empty_fields():
    rec = assemble([])
    assert rec["vendor"] is None and rec["items"] == [] and rec["confidence"] == 0.0


def test_summary_rows_excluded_from_items():
    """Footer Subtotal/Tax/Change rows (mislabeled LINE_TOTAL) must not become phantom items."""
    fields = [
        {"cls": "ITEM", "bbox": [0, 100, 80, 120], "text": "Latte Coffee", "conf": 0.9},
        {"cls": "LINE_TOTAL", "bbox": [120, 100, 160, 120], "text": "12.00", "conf": 0.9},
        {"cls": "ITEM", "bbox": [0, 200, 60, 220], "text": "Subtotal", "conf": 0.6},
        {"cls": "LINE_TOTAL", "bbox": [120, 200, 160, 220], "text": "12.00", "conf": 0.8},
        {"cls": "LINE_TOTAL", "bbox": [120, 230, 160, 250], "text": "0.72", "conf": 0.8},  # bare tax amt
        {"cls": "ITEM", "bbox": [0, 260, 60, 280], "text": "Change", "conf": 0.6},
        {"cls": "LINE_TOTAL", "bbox": [120, 260, 160, 280], "text": "8.00", "conf": 0.8},
    ]
    rec = assemble(fields)
    assert [it["description"] for it in rec["items"]] == ["Latte Coffee"]


def test_total_recovered_when_total_class_missing():
    """No TOTAL box, but a 'Total (RM)' label + amount in the same row -> recover the grand total."""
    fields = [
        {"cls": "OTHER", "bbox": [0, 300, 80, 320], "text": "Total (RM) :", "conf": 0.8},
        {"cls": "LINE_TOTAL", "bbox": [120, 300, 170, 320], "text": "57.45", "conf": 0.8},
    ]
    rec = assemble(fields)
    assert rec["total"] == 57.45


def test_tax_uses_amount_not_label():
    """TAX fires on the label more than the value; the assembled tax must be the decimal amount."""
    fields = [
        {"cls": "TAX", "bbox": [0, 300, 90, 320], "text": "Total GST (RM)", "conf": 0.95},
        {"cls": "TAX", "bbox": [120, 300, 160, 320], "text": "0.65", "conf": 0.7},
    ]
    rec = assemble(fields)
    assert rec["tax"] == 0.65


def test_date_prefix_stripped():
    fields = [{"cls": "DATE", "bbox": [0, 50, 120, 70], "text": "Date: 12/02/2026", "conf": 0.8}]
    rec = assemble(fields)
    assert rec["date"] == "12/02/2026"
