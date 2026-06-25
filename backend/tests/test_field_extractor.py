"""Unit tests for field_extractor orchestration — mocked detector + OCR (no torch/paddle needed).

The real YOLO + PaddleOCR engines are dependency-injected, so these tests exercise the cropping,
OCR-wiring and assembly hand-off using a synthetic image and fake engines.
"""
import os
import tempfile

import cv2
import numpy as np

from app.field_extractor import (
    _iou,
    _nms,
    _pad_box,
    extract,
    extract_business_schema,
    extract_fields,
    to_business_schema,
)


def _synthetic_image(path, w=600, h=900):
    """A blank white receipt-sized image is enough — OCR is mocked."""
    img = np.full((h, w, 3), 255, dtype=np.uint8)
    cv2.imwrite(path, img)


def test_pad_box_clamps_to_bounds():
    # box hugging the top-left corner should not produce negative coords (pad = 2px floor)
    assert _pad_box([0, 0, 50, 20], w=600, h=900) == [0, 0, 52, 22]
    # box at the far edge should clamp to w/h
    padded = _pad_box([590, 880, 600, 900], w=600, h=900)
    assert padded[2] <= 600 and padded[3] <= 900


def test_iou_overlap_and_disjoint():
    assert _iou([0, 0, 10, 10], [0, 0, 10, 10]) == 1.0
    assert _iou([0, 0, 10, 10], [100, 100, 110, 110]) == 0.0
    # half-overlapping horizontally -> intersection 50, union 150 -> 1/3
    assert abs(_iou([0, 0, 10, 10], [5, 0, 15, 10]) - (50 / 150)) < 1e-6


def test_nms_drops_overlapping_lower_confidence_box():
    # same region detected under two classes -> keep the higher-confidence one
    boxes = [
        {"cls": "DATE", "bbox": [0, 0, 100, 20], "conf": 0.36},
        {"cls": "DOCUMENT_NO", "bbox": [1, 1, 99, 19], "conf": 0.70},
        {"cls": "LINE_TOTAL", "bbox": [400, 200, 500, 240], "conf": 0.84},  # disjoint -> survives
    ]
    kept = _nms(boxes)
    assert len(kept) == 2
    assert {b["cls"] for b in kept} == {"DOCUMENT_NO", "LINE_TOTAL"}


def test_extract_fields_wires_text_per_box():
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "r.png")
        _synthetic_image(p)

        boxes = [
            {"cls": "COMPANY", "bbox": [10, 10, 300, 60], "conf": 0.9},
            {"cls": "ITEM", "bbox": [10, 200, 200, 240], "conf": 0.8},
            {"cls": "QTY", "bbox": [210, 200, 260, 240], "conf": 0.7},
            {"cls": "LINE_TOTAL", "bbox": [400, 200, 500, 240], "conf": 0.85},
        ]
        texts = iter(["ACME STORE", "Cola", "2", "5.00"])
        fields = extract_fields(
            p,
            detector=lambda _p: boxes,
            ocr_reader=lambda _crop: next(texts),
        )

        assert [f["cls"] for f in fields] == ["COMPANY", "ITEM", "QTY", "LINE_TOTAL"]
        assert fields[0]["text"] == "ACME STORE"
        assert fields[3]["text"] == "5.00"
        # bbox is the original (un-padded) box, conf preserved
        assert fields[0]["bbox"] == [10, 10, 300, 60]
        assert fields[2]["conf"] == 0.7


def test_extract_returns_assembled_record():
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "r.png")
        _synthetic_image(p)

        boxes = [
            {"cls": "COMPANY", "bbox": [10, 10, 300, 60], "conf": 0.9},
            {"cls": "TOTAL", "bbox": [400, 100, 500, 140], "conf": 0.9},
            {"cls": "ITEM", "bbox": [10, 200, 200, 240], "conf": 0.8},
            {"cls": "QTY", "bbox": [210, 200, 260, 240], "conf": 0.8},
            {"cls": "LINE_TOTAL", "bbox": [400, 200, 500, 240], "conf": 0.8},
        ]
        texts = iter(["ACME STORE", "10.00", "Cola", "2", "10.00"])
        record = extract(
            p,
            detector=lambda _p: boxes,
            ocr_reader=lambda _crop: next(texts),
        )

        assert record["vendor"] == "ACME STORE"
        assert record["total"] == 10.0
        assert record["engine"] == "local"
        assert len(record["items"]) == 1
        assert record["items"][0]["qty"] == 2.0
        assert record["items"][0]["line_total"] == 10.0
        # raw boxes surfaced for the UI overlay
        assert len(record["detected_fields"]) == 5


def test_extract_no_detections_is_empty_record():
    record = extract("nonexistent.png", detector=lambda _p: [], ocr_reader=lambda _c: "")
    assert record["vendor"] is None
    assert record["items"] == []
    assert record["detected_fields"] == []
    assert record["engine"] == "local"


def test_to_business_schema_matches_app_shape():
    record = {
        "vendor": "ACME STORE", "date": "01/01/2026", "total": 10.0, "tax": 0.5,
        "address": "1 Main St",
        "items": [{"description": "Cola", "qty": 2.0, "unit_price": 5.0, "line_total": 10.0}],
        "confidence": 0.8,
        "detected_fields": [{"cls": "COMPANY", "bbox": [0, 0, 1, 1], "text": "ACME", "conf": 0.9}],
    }
    schema = to_business_schema(record)
    # every key the rule parser's build_final_output emits must be present
    for key in ("vendor", "date", "currency", "items", "tax", "subtotal", "total",
                "confidence_flags", "processing_timestamp", "item_count"):
        assert key in schema
    assert schema["vendor"] == "ACME STORE"
    assert schema["total"] == 10.0
    assert schema["item_count"] == 1
    assert schema["engine"] == "local"
    assert schema["extraction_method"] == "field_detector"
    # None vendor must degrade to "" (DB column is a string)
    assert to_business_schema({"items": []})["vendor"] == ""


def test_extract_business_schema_falls_back_when_too_few_fields():
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "r.png")
        _synthetic_image(p)
        # only 2 detected boxes (< MIN_DETECTED_FIELDS) -> (None, False) so caller uses rule parser
        few = [
            {"cls": "COMPANY", "bbox": [10, 10, 300, 60], "conf": 0.9},
            {"cls": "TOTAL", "bbox": [400, 100, 500, 140], "conf": 0.9},
        ]
        schema, used = extract_business_schema(
            p, detector=lambda _p: few, ocr_reader=lambda _c: "x")
        assert used is False and schema is None

        # enough boxes -> a mapped schema with used=True
        many = few + [
            {"cls": "ITEM", "bbox": [10, 200, 200, 240], "conf": 0.8},
            {"cls": "QTY", "bbox": [210, 200, 260, 240], "conf": 0.8},
            {"cls": "LINE_TOTAL", "bbox": [400, 200, 500, 240], "conf": 0.8},
        ]
        texts = iter(["ACME", "9.00", "Cola", "1", "9.00"])
        schema, used = extract_business_schema(
            p, detector=lambda _p: many, ocr_reader=lambda _c: next(texts))
        assert used is True
        assert schema["engine"] == "local"
        assert schema["item_count"] >= 1
