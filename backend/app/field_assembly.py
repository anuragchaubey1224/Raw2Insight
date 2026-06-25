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


# --- summary/footer vs real-item discrimination -----------------------------------------
# Tokens/phrases that mark a row as a receipt summary or footer line, never a purchased item.
# Detection mislabels footer amounts as LINE_TOTAL (TOTAL->LINE_TOTAL is 50% per the eval), so the
# Subtotal/Total/Tax/Change rows would otherwise each become a phantom item. These are universal
# receipt labels, not project-specific values.
_SUMMARY_TOKENS = {
    "subtotal", "total", "tax", "gst", "sst", "vat", "discount", "rounding", "round",
    "change", "cash", "balance", "nett", "net", "tendered", "tender", "payment", "paid",
    "due", "qty", "amount", "description", "saving", "savings",
}
_SUMMARY_PHRASES = (
    "sub total", "thank you", "goods sold", "not returnable", "service charge",
    "amount due", "total qty", "total saving", "tax invoice", "gst summary",
)


def _is_summary_label(text: Optional[str]) -> bool:
    """True if a row's description is a summary/footer label, not a product line.

    Heuristic: real items have long product names; summary labels are short ("Subtotal",
    "Total (RM):", "Change", "Total GST (RM)"). So a row counts as summary when it matches a
    known phrase, or it is short (<=3 words) and contains a summary token. Long descriptions
    that merely happen to contain "total" survive.
    """
    if not text:
        return False
    t = str(text).lower()
    if any(ph in t for ph in _SUMMARY_PHRASES):
        return True
    words = re.findall(r"[a-z]+", t)
    return bool(words) and len(words) <= 3 and any(w in _SUMMARY_TOKENS for w in words)


# Footer markers: the summary/total band begins at the first of these. Real line items live above it,
# so footer amounts (Subtotal/Total/Tax/Change) — which detection mislabels LINE_TOTAL — are excluded.
_BAND_MARKERS = (
    "subtotal", "sub total", "grand total", "total (", "total(", "total :", "total:",
    "nett total", "net total", "amount due", "rounding", "round off", "total qty",
    "total amount", "total inclusive", "total sales", "total saving",
)


def _summary_band_top(fields: List[Dict]) -> float:
    """Y at which the receipt's summary/footer band starts; line items are above it (inf if none)."""
    ys = [_y_center(f["bbox"]) for f in fields
          if any(m in (f.get("text") or "").lower() for m in _BAND_MARKERS)]
    return min(ys) if ys else float("inf")


def _assemble_items(fields: List[Dict]) -> List[Dict[str, Any]]:
    """Build line items from the item region only, anchored on detected amounts.

    Why anchor on LINE_TOTAL: every purchased line has an amount, and LINE_TOTAL detection is strong
    (~94%), whereas grouping often splits a description from its amount. Counting only amount-bearing
    rows above the summary band avoids both phantom footer rows and double-counting split descriptions.
    """
    summary_y = _summary_band_top(fields)
    region = [f for f in fields if f.get("cls") in ITEM_CLASSES and _y_center(f["bbox"]) < summary_y]
    rows = _group_rows(region)

    def _has_amount(row):
        return any(b.get("cls") == "LINE_TOTAL" and parse_number(b.get("text")) is not None for b in row)

    amount_rows = [r for r in rows if _has_amount(r)]
    chosen = amount_rows if amount_rows else rows  # fall back to desc rows if no amounts detected
    items = []
    for row in chosen:
        it = _row_to_item(row)
        desc = it.get("description")
        if desc and _is_summary_label(desc):
            continue
        if not amount_rows and not desc:   # in fallback mode keep only named rows
            continue
        items.append(it)
    return items


def _money_value(text: Optional[str]) -> Optional[float]:
    """Parse a currency amount (requires a decimal point) so we never grab phone/doc numbers."""
    if not text:
        return None
    s = (str(text).replace("O", "0").replace("o", "0")
                  .replace("l", "1").replace("I", "1").replace(",", ""))
    m = re.search(r"-?\d+\.\d{2}\b", s) or re.search(r"-?\d+\.\d+", s)
    return float(m.group()) if m else None


def _row_money_to_right(fields: List[Dict], label: Dict) -> Optional[float]:
    """Right-most decimal amount sharing the label box's row (to its right)."""
    ly, lh, lx = _y_center(label["bbox"]), _height(label["bbox"]), label["bbox"][0]
    cands = []
    for f in fields:
        if f is label or f["bbox"][0] < lx:
            continue
        if abs(_y_center(f["bbox"]) - ly) <= lh * 0.8:
            v = _money_value(f.get("text"))
            if v is not None:
                cands.append((f["bbox"][0], v))
    return max(cands)[1] if cands else None


def _row_text(fields: List[Dict], ref: Dict) -> str:
    """Lowercased text of every box sharing ref's row (used to identify cash/change lines)."""
    y, h = _y_center(ref["bbox"]), _height(ref["bbox"])
    return " ".join((g.get("text") or "") for g in fields
                    if abs(_y_center(g["bbox"]) - y) <= max(h, _height(g["bbox"])) * 0.8).lower()


# Rows whose amount is NOT the grand total (a customer payment / adjustment, not what was owed).
_NON_TOTAL_ROW = ("change", "cash", "tender", "kembali", "tunai", "rounding", "round off", "bayaran")


def _recover_total(fields: List[Dict]) -> Optional[float]:
    """Grand total when the TOTAL class was missed/mislabeled (TOTAL->LINE_TOTAL ~50% per the eval).

    The grand total is the largest amount in the summary band that is not a cash/change/rounding line
    (those can exceed the total). Falls back to the largest non-cash amount when no band is detected."""
    sy = _summary_band_top(fields)
    footer = []
    for f in fields:
        v = _money_value(f.get("text"))
        if v is None or abs(v) >= 1e6 or _y_center(f["bbox"]) < sy:
            continue
        if any(x in _row_text(fields, f) for x in _NON_TOTAL_ROW):
            continue
        footer.append(v)
    if footer:
        return max(footer)
    loose = [_money_value(f.get("text")) for f in fields
             if not any(x in _row_text(fields, f) for x in _NON_TOTAL_ROW)]
    loose = [a for a in loose if a is not None and abs(a) < 1e6]
    return max(loose) if loose else None


def _recover_tax(fields: List[Dict]) -> Optional[float]:
    """Tax amount from TAX boxes. TAX often fires on the *label* ("Total GST (RM)", "GSTNo:..."),
    so take the TAX box that actually holds a decimal amount, else the amount in a TAX label's row."""
    tax_boxes = [f for f in fields if f.get("cls") == "TAX"]
    valued = [(f, _money_value(f.get("text"))) for f in tax_boxes]
    valued = [(f, v) for f, v in valued if v is not None]
    if valued:
        valued.sort(key=lambda fv: fv[0].get("conf", 0), reverse=True)
        return valued[0][1]
    for lab in sorted(tax_boxes, key=lambda f: f.get("conf", 0), reverse=True):
        v = _row_money_to_right(fields, lab)
        if v is not None:
            return v
    return None


_DATE_PREFIX = re.compile(
    r"^\s*(date|tarikh|tarih|invoice\s*date|inv\.?\s*date|bill\s*date)\s*[:\-]?\s*", re.I)


def _clean_date(text: Optional[str]) -> Optional[str]:
    """Strip a leading 'Date:' style label so the value is the date itself."""
    if not text:
        return text
    return _DATE_PREFIX.sub("", str(text)).strip() or None


def assemble(fields: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Assemble detected fields into a structured receipt record with a confidence score."""
    headers = {key: _pick_text(fields, cls) for cls, key in HEADER_CLASSES.items()}

    # Line items: amount-anchored, restricted to the item region (above the summary band). This drops
    # the footer Subtotal/Total/Tax/Change rows (detection labels them LINE_TOTAL) without killing real
    # items whose description and amount land in separate grouped rows.
    items = _assemble_items(fields)

    # Total: trust the TOTAL class; recover from the footer when it was missed/mislabeled.
    total = parse_number(headers.get("total"))
    if total is None:
        total = _recover_total(fields)
    # Tax: money-aware pick (TAX class frequently fires on labels, not the amount).
    tax = _recover_tax(fields)
    date = _clean_date(headers.get("date"))

    # Confidence: blend detector confidence with line-item math consistency
    det_conf = (sum(f.get("conf", 0) for f in fields) / len(fields)) if fields else 0.0
    if items:
        math_conf = sum(1 for it in items if _math_ok(it)) / len(items)
        confidence = round(0.5 * det_conf + 0.5 * math_conf, 3)
    else:
        confidence = round(det_conf, 3)

    return {
        "vendor": headers.get("vendor"),
        "date": date,
        "total": total,
        "tax": tax,
        "address": headers.get("address"),
        "items": items,
        "confidence": confidence,
    }
