"""Spatial field-assembly: turn detected receipt fields into a structured record.

Input is a list of detected fields, each:
    {"cls": <class name>, "bbox": [x1, y1, x2, y2], "text": <ocr text>, "conf": <float>}

The detector's CLASS tells us what each box is (QTY vs UNIT_PRICE vs LINE_TOTAL ...), so we never
guess columns (the old brittle approach). Line-item boxes are grouped into rows by vertical overlap;
header fields take the highest-confidence box per class. Pure logic (no torch/OCR) -> fully testable.
"""
import re
from typing import Any, Dict, List, Optional

# Header field class -> output key
HEADER_CLASSES = {
    "COMPANY": "vendor", "DATE": "date", "TOTAL": "total", "TAX": "tax",
    "ADDRESS": "address", "DOCUMENT_NO": "document_no", "CASHIER": "cashier",
}
# Classes that make up a line item (grouped per row)
ITEM_CLASSES = {"ITEM", "QTY", "UNIT_PRICE", "LINE_TOTAL"}


def _y_center(b: List[float]) -> float:
    return (b[1] + b[3]) / 2.0


def _height(b: List[float]) -> float:
    return max(1.0, b[3] - b[1])


def parse_number(text: Optional[str]) -> Optional[float]:
    """Extract a number from OCR text. Safe to apply OCR fixes here because it is only ever
    called on NUMERIC fields (QTY/UNIT_PRICE/LINE_TOTAL/TOTAL/TAX) — field-type-aware cleaning."""
    if text is None:
        return None
    s = str(text)
    s = (s.replace("O", "0").replace("o", "0")
           .replace("l", "1").replace("I", "1").replace("S", "5"))
    s = s.replace(",", "")  # thousands separator
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    return float(m.group()) if m else None


def _pick_text(boxes: List[Dict], cls: str) -> Optional[str]:
    """Highest-confidence text for a given class among boxes (or None)."""
    cands = [b for b in boxes if b.get("cls") == cls]
    if not cands:
        return None
    return max(cands, key=lambda b: b.get("conf", 0)).get("text")


def _group_rows(item_boxes: List[Dict]) -> List[List[Dict]]:
    """Group line-item field boxes into rows by vertical position (adaptive to box height)."""
    if not item_boxes:
        return []
    boxes = sorted(item_boxes, key=lambda d: _y_center(d["bbox"]))
    heights = sorted(_height(d["bbox"]) for d in boxes)
    tol = heights[len(heights) // 2] * 0.6  # 60% of the median box height
    rows, current, last_y = [], [boxes[0]], _y_center(boxes[0]["bbox"])
    for d in boxes[1:]:
        yc = _y_center(d["bbox"])
        if abs(yc - last_y) <= tol:
            current.append(d)
        else:
            rows.append(current)
            current = [d]
        last_y = yc
    rows.append(current)
    return rows


def _row_to_item(row: List[Dict]) -> Dict[str, Any]:
    desc = _pick_text(row, "ITEM")
    qty = parse_number(_pick_text(row, "QTY"))
    unit_price = parse_number(_pick_text(row, "UNIT_PRICE"))
    line_total = parse_number(_pick_text(row, "LINE_TOTAL"))
    # UNIT_PRICE detection is unreliable (1 training example) -> derive when missing
    if unit_price is None and line_total is not None and qty:
        unit_price = round(line_total / qty, 2)
    if qty is None:
        qty = 1.0
    return {"description": desc, "qty": qty, "unit_price": unit_price, "line_total": line_total}


def _math_ok(item: Dict[str, Any]) -> bool:
    q, u, lt = item.get("qty"), item.get("unit_price"), item.get("line_total")
    if q is None or u is None or lt is None:
        return False
    return abs(q * u - lt) <= max(0.02, 0.02 * abs(lt))


def assemble(fields: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Assemble detected fields into a structured receipt record with a confidence score."""
    headers = {key: _pick_text(fields, cls) for cls, key in HEADER_CLASSES.items()}

    item_boxes = [f for f in fields if f.get("cls") in ITEM_CLASSES]
    items = [_row_to_item(r) for r in _group_rows(item_boxes)]
    items = [it for it in items if it.get("description") or it.get("line_total") is not None]

    # Confidence: blend detector confidence with line-item math consistency
    det_conf = (sum(f.get("conf", 0) for f in fields) / len(fields)) if fields else 0.0
    if items:
        math_conf = sum(1 for it in items if _math_ok(it)) / len(items)
        confidence = round(0.5 * det_conf + 0.5 * math_conf, 3)
    else:
        confidence = round(det_conf, 3)

    return {
        "vendor": headers.get("vendor"),
        "date": headers.get("date"),
        "total": parse_number(headers.get("total")),
        "tax": parse_number(headers.get("tax")),
        "address": headers.get("address"),
        "items": items,
        "confidence": confidence,
    }
