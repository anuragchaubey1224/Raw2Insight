"""Phase 2 extraction core: trained YOLO field-detector -> PaddleOCR per box -> spatial assembly.

This is the PRIMARY extraction path (100% local CPU, no API). Flow per receipt image:

  1. the custom YOLOv8 field-detector locates each field  -> boxes {cls, bbox, conf}
  2. each box is cropped (padded) and OCR'd individually  -> text for that field
  3. field_assembly.assemble() turns the labelled boxes    -> a structured record

Because the detector labels every box's CLASS (QTY / UNIT_PRICE / LINE_TOTAL / COMPANY ...),
the column-guessing of the old rule parser is gone — the class *is* the field.

Heavy deps (ultralytics/torch, paddleocr) are **lazy-loaded** and the detector + OCR callables are
**dependency-injectable**, so the orchestration logic is fully unit-testable with mocks — no torch or
paddle needed to run the tests. The real engines load only when `extract()` is called without overrides.
"""
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from app.field_assembly import assemble

logger = logging.getLogger(__name__)

# Detected field: {"cls": str, "bbox": [x1,y1,x2,y2], "text": str, "conf": float}
Field = Dict[str, Any]
# A detector reads an image path and returns boxes WITHOUT text: {"cls","bbox","conf"}
Detector = Callable[[str], List[Field]]
# An OCR reader turns an image crop (ndarray) into a text string
OcrReader = Callable[[Any], str]

# Default confidence floor for keeping a detection.
DEFAULT_CONF_THRESHOLD = 0.25
# Padding added around each detected box before OCR (fraction of box height), helps edge glyphs.
CROP_PAD_FRAC = 0.06
# IoU above which two overlapping boxes are treated as the same region (class-agnostic NMS).
# YOLO's built-in NMS is per-class, so the same region detected under two classes survives — this
# extra class-agnostic pass keeps only the highest-confidence label per region.
NMS_IOU_THRESHOLD = 0.5

# Model location: shipped at backend/models/field_detector.pt; fall back to the training artifact.
_MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
_DEFAULT_MODEL_PATH = _MODELS_DIR / "field_detector.pt"
_FALLBACK_MODEL_PATH = Path(__file__).resolve().parent.parent / "tests" / "best.pt"


def get_model_path() -> str:
    """Resolve the field-detector weights path (env override -> models/ -> training artifact)."""
    env = os.getenv("FIELD_DETECTOR_PATH")
    if env and Path(env).exists():
        return env
    if _DEFAULT_MODEL_PATH.exists():
        return str(_DEFAULT_MODEL_PATH)
    return str(_FALLBACK_MODEL_PATH)


# --- Lazy singletons for the real engines -------------------------------------------------

_yolo_model = None  # ultralytics.YOLO


def _load_yolo():
    """Lazily load the trained YOLO field-detector (cached)."""
    global _yolo_model
    if _yolo_model is None:
        from ultralytics import YOLO  # heavy import, deferred
        path = get_model_path()
        logger.info("Loading field-detector: %s", path)
        _yolo_model = YOLO(path)
    return _yolo_model


def _real_detector(image_path: str, conf_threshold: float = DEFAULT_CONF_THRESHOLD) -> List[Field]:
    """Run the trained YOLO field-detector and return labelled boxes (no text yet)."""
    model = _load_yolo()
    results = model(image_path, verbose=False)
    fields: List[Field] = []
    for r in results:
        names = r.names  # {id: classname}
        boxes = r.boxes
        if boxes is None:
            continue
        for b in boxes:
            conf = float(b.conf[0])
            if conf < conf_threshold:
                continue
            cls_id = int(b.cls[0])
            x1, y1, x2, y2 = (float(v) for v in b.xyxy[0])
            fields.append({
                "cls": str(names.get(cls_id, cls_id)).upper(),
                "bbox": [x1, y1, x2, y2],
                "conf": conf,
            })
    return fields


def _tokens_text(results) -> str:
    """Pull readable text out of a PaddleOCR result, ordered top-to-bottom then left-to-right."""
    from app.ocr_engine import _extract_tokens_from_results
    tokens = _extract_tokens_from_results(results, "crop")
    # order by row (y) then column (x) so multi-token fields read naturally
    tokens.sort(key=lambda t: (round(t["bbox"][1] / 10.0), t["bbox"][0]))
    return " ".join(t["text"] for t in tokens).strip()


def _real_ocr_reader(crop) -> str:
    """OCR a single cropped field region with the shared PaddleOCR engine."""
    from app.ocr_engine import get_ocr_engine
    engine = get_ocr_engine("en")
    try:
        results = engine.predict(crop)
    except Exception as e:  # a single bad crop must never kill the whole extraction
        logger.warning("OCR failed on a crop: %s", e)
        return ""
    return _tokens_text(results)


# --- Pure orchestration (testable with mocks) ---------------------------------------------

def _iou(a: List[float], b: List[float]) -> float:
    """Intersection-over-union of two [x1,y1,x2,y2] boxes."""
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
    area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _nms(boxes: List[Field], iou_threshold: float = NMS_IOU_THRESHOLD) -> List[Field]:
    """Class-agnostic greedy NMS: keep the highest-confidence box per overlapping region.

    Suppression is decided in confidence order, but the survivors are returned in the original
    input order so downstream output is stable/predictable.
    """
    order = sorted(range(len(boxes)), key=lambda i: boxes[i].get("conf", 0.0), reverse=True)
    keep_idx: List[int] = []
    for i in order:
        if all(_iou(boxes[i]["bbox"], boxes[j]["bbox"]) <= iou_threshold for j in keep_idx):
            keep_idx.append(i)
    keep = set(keep_idx)
    return [b for i, b in enumerate(boxes) if i in keep]


def _pad_box(bbox: List[float], w: int, h: int) -> List[int]:
    """Pad a bbox by CROP_PAD_FRAC of its height, clamped to the image bounds."""
    x1, y1, x2, y2 = bbox
    pad = max(2.0, (y2 - y1) * CROP_PAD_FRAC)
    nx1 = int(max(0, x1 - pad))
    ny1 = int(max(0, y1 - pad))
    nx2 = int(min(w, x2 + pad))
    ny2 = int(min(h, y2 + pad))
    return [nx1, ny1, nx2, ny2]


def extract_fields(
    image_path: str,
    detector: Optional[Detector] = None,
    ocr_reader: Optional[OcrReader] = None,
    conf_threshold: float = DEFAULT_CONF_THRESHOLD,
) -> List[Field]:
    """Detect field boxes, OCR each crop, and return labelled fields with text.

    `detector` and `ocr_reader` are injectable for testing; when omitted the real YOLO + PaddleOCR
    engines are used. Returns a list of {cls, bbox, text, conf}.
    """
    if detector is None:
        detector = lambda p: _real_detector(p, conf_threshold)
    if ocr_reader is None:
        ocr_reader = _real_ocr_reader

    boxes = _nms(detector(image_path))
    if not boxes:
        return []

    import cv2  # deferred so importing this module needs no opencv
    image = cv2.imread(image_path)
    if image is None:
        logger.warning("Could not read image for field extraction: %s", image_path)
        return []
    h, w = image.shape[:2]

    fields: List[Field] = []
    for box in boxes:
        x1, y1, x2, y2 = _pad_box(box["bbox"], w, h)
        if x2 <= x1 or y2 <= y1:
            continue
        crop = image[y1:y2, x1:x2]
        text = ocr_reader(crop) if crop.size else ""
        fields.append({
            "cls": box["cls"],
            "bbox": box["bbox"],
            "text": text,
            "conf": box.get("conf", 0.0),
        })
    return fields


def extract(
    image_path: str,
    detector: Optional[Detector] = None,
    ocr_reader: Optional[OcrReader] = None,
    conf_threshold: float = DEFAULT_CONF_THRESHOLD,
) -> Dict[str, Any]:
    """Full local extraction: image -> detected fields -> assembled structured record.

    The returned record matches field_assembly.assemble() (vendor/date/total/tax/address/items/
    confidence) plus `detected_fields` (for the UI overlay) and `engine` ("local").
    """
    fields = extract_fields(image_path, detector, ocr_reader, conf_threshold)
    record = assemble(fields)
    record["detected_fields"] = fields
    record["engine"] = "local"
    return record


# Below this many detected boxes the receipt is treated as "detector found too little" -> fall back.
MIN_DETECTED_FIELDS = 4


def to_business_schema(record: Dict[str, Any]) -> Dict[str, Any]:
    """Map a field_extractor record to the app's business-schema dict (same shape the rule parser
    emits via build_final_output), so /result, CSV/Excel export and the DB are all unaffected."""
    items = record.get("items", [])
    return {
        "vendor": record.get("vendor") or "",
        "date": record.get("date"),
        "currency": "MYR",  # detector doesn't classify currency; keep the existing default
        "items": items,
        "tax": record.get("tax") or 0.0,
        "subtotal": 0.0,  # not a detected field
        "total": record.get("total") or 0.0,
        "confidence_flags": [],
        "processing_timestamp": datetime.now().isoformat(),
        "item_count": len(items),
        # extras — frontend ignores unknown keys; used for the overlay + provenance
        "address": record.get("address"),
        "confidence": record.get("confidence"),
        "detected_fields": record.get("detected_fields", []),
        "engine": "local",
        "extraction_method": "field_detector",
    }


def extract_business_schema(
    image_path: str,
    min_fields: int = MIN_DETECTED_FIELDS,
    detector: Optional[Detector] = None,
    ocr_reader: Optional[OcrReader] = None,
) -> Tuple[Optional[Dict[str, Any]], bool]:
    """Run the field-detector pipeline and map to the business schema.

    Returns (schema, used). When the detector finds fewer than `min_fields` boxes the receipt is
    out-of-distribution for our model, so this returns (None, False) and the caller should fall
    back to the rule parser. `detector`/`ocr_reader` are injectable for testing.
    """
    record = extract(image_path, detector, ocr_reader)
    if len(record.get("detected_fields", [])) < min_fields:
        return None, False
    return to_business_schema(record), True
