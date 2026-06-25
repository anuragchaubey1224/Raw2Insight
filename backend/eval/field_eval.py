"""Phase 4 eval harness: measure the learned KIE pipeline on the held-out val set.

Two independent measurements (run either or both via --mode):

  detection  -- ultralytics val() on the full val split: per-class P/R/F1/mAP +
                a class-confusion matrix. This is the GOLD detection metric and
                pinpoints which classes the detector confuses (COMPANY<->ITEM,
                TAX firing on labels, etc.). Fast (~1-3 min CPU, detection only).

  field      -- end-to-end field extraction on a deterministic subsample. For each
                image we compute TWO records and compare them:
                  * real     = extract(image)            -> production pipeline
                  * oracle   = assemble(OCR(GT boxes))   -> perfect detection ceiling
                The split is the whole point:
                  gap(oracle vs real)  = error caused by the DETECTOR
                  error in oracle      = error caused by ASSEMBLY + OCR
                We also report item-count inflation, the headline visible bug:
                  GT ITEM-box count  = true number of line items (human label)
                  vs oracle items    = pure assembly row-grouping error
                  vs real items      = + detector noise

Run (from repo root, ML env):
  backend/venv_ml/bin/python backend/eval/field_eval.py --mode all --n 12
"""
import argparse
import json
import sys
import time
from pathlib import Path

# --- paths / make `app` importable -------------------------------------------------------
BACKEND = Path(__file__).resolve().parent.parent
REPO = BACKEND.parent
DATASET = REPO / "dataset"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

CLASSES = [c.strip() for c in (DATASET / "classes.txt").read_text().splitlines() if c.strip()]
ID2CLS = {i: c for i, c in enumerate(CLASSES)}
HEADER_CLASSES = {"COMPANY", "DATE", "TOTAL", "TAX", "ADDRESS", "DOCUMENT_NO", "CASHIER"}
ITEM_CLASS = "ITEM"


# --- small text/number helpers -----------------------------------------------------------

def _norm(s):
    """Loose normalize for string comparison: lowercase, alnum-only."""
    if not s:
        return ""
    return "".join(ch for ch in str(s).lower() if ch.isalnum())


def _str_match(a, b):
    """True if the shorter normalized string is contained in the longer (OCR-tolerant)."""
    na, nb = _norm(a), _norm(b)
    if not na or not nb:
        return False
    short, long = (na, nb) if len(na) <= len(nb) else (nb, na)
    return short in long


def _num_match(a, b, tol=0.02):
    if a is None or b is None:
        return False
    return abs(float(a) - float(b)) <= max(tol, tol * abs(float(b)))


# --- ground-truth parsing -----------------------------------------------------------------

def _read_gt_boxes(stem, w, h):
    """Read YOLO label file -> [{cls, bbox:[x1,y1,x2,y2]}] in pixel coords."""
    lbl = DATASET / "labels" / f"{stem}.txt"
    boxes = []
    if not lbl.exists():
        return boxes
    for line in lbl.read_text().splitlines():
        parts = line.split()
        if len(parts) < 5:
            continue
        cid, cx, cy, bw, bh = int(parts[0]), *(float(v) for v in parts[1:5])
        x1 = (cx - bw / 2) * w
        y1 = (cy - bh / 2) * h
        x2 = (cx + bw / 2) * w
        y2 = (cy + bh / 2) * h
        boxes.append({"cls": ID2CLS.get(cid, str(cid)), "bbox": [x1, y1, x2, y2]})
    return boxes


# --- detection eval (full val) ------------------------------------------------------------

def run_detection_eval():
    from ultralytics import YOLO
    from app.field_extractor import get_model_path

    # ultralytics resolves bare list paths relative to CWD (-> wrong dir) and a stale Windows-era
    # images.cache shadows the scan. Fix both: write an ABSOLUTE val list + point the yaml at it.
    eval_dir = BACKEND / "eval"
    val_rel = [l.strip() for l in (DATASET / "val.txt").read_text().splitlines() if l.strip()]
    abs_val = eval_dir / "_val_abs.txt"
    abs_val.write_text("\n".join(str(DATASET / p) for p in val_rel) + "\n")
    for stale in DATASET.glob("*.cache"):  # remove Windows-era cache so the scan is rebuilt
        stale.unlink()
    tmp_yaml = eval_dir / "_data_abs.yaml"
    tmp_yaml.write_text(
        f"path: {DATASET}\n"
        f"train: {abs_val}\n"  # val mode never reads train; reuse the list to satisfy the schema
        f"val: {abs_val}\n"
        "nc: 12\n"
        f"names: {CLASSES}\n"
    )
    model = YOLO(get_model_path())
    t0 = time.time()
    # plots=True is REQUIRED for ultralytics to populate the confusion matrix (it's gated on plots)
    m = model.val(data=str(tmp_yaml), split="val", verbose=False, plots=True,
                  project=str(eval_dir), name="val_run", exist_ok=True)
    dt = time.time() - t0

    names = m.names  # {id: name}
    p = m.box.p.tolist()
    r = m.box.r.tolist()
    ap50 = m.box.ap50.tolist()
    ap = m.box.ap.tolist()  # mAP50-95 per class
    ap_class_index = list(m.box.ap_class_index)

    per_class = {}
    for k, ci in enumerate(ap_class_index):
        cname = names[ci]
        pr, rc = p[k], r[k]
        f1 = (2 * pr * rc / (pr + rc)) if (pr + rc) else 0.0
        per_class[cname] = {
            "precision": round(pr, 3), "recall": round(rc, 3), "f1": round(f1, 3),
            "ap50": round(ap50[k], 3), "ap50_95": round(ap[k], 3),
        }

    overall = {
        "mAP50": round(float(m.box.map50), 3),
        "mAP50_95": round(float(m.box.map), 3),
        "precision": round(float(m.box.mp), 3),
        "recall": round(float(m.box.mr), 3),
        "val_seconds": round(dt, 1),
    }

    # confusion matrix: matrix[pred][true], last index = background (computed at conf=0.25, iou=0.45)
    cm = m.confusion_matrix.matrix  # ndarray (nc+1, nc+1)
    labels = [names[i] for i in range(len(names))] + ["background"]
    n = cm.shape[0]
    bg = n - 1
    col_tot = cm.sum(axis=0)  # total GT instances per true class (last col = bg/FP source)

    confusions = []  # notable cross-class: true class j predicted as a DIFFERENT real class i
    for j in range(n - 1):
        tot = col_tot[j]
        if tot <= 0:
            continue
        for i in range(n - 1):  # skip background row here
            if i == j:
                continue
            frac = cm[i][j] / tot
            if frac >= 0.05 and cm[i][j] >= 1:
                confusions.append({"true": labels[j], "predicted_as": labels[i],
                                   "count": int(cm[i][j]), "frac_of_true": round(float(frac), 3)})
    confusions.sort(key=lambda d: d["frac_of_true"], reverse=True)

    # per-class breakdown: correct / confused-as-other / MISSED(->background); plus FPs(background->i)
    breakdown = {}
    for j in range(n - 1):
        tot = col_tot[j]
        if tot <= 0:
            continue
        correct = cm[j][j]
        missed = cm[bg][j]  # true j detected as nothing = false negative
        confused = tot - correct - missed
        breakdown[labels[j]] = {
            "gt_instances": int(tot),
            "correct_frac": round(float(correct / tot), 3),
            "missed_frac": round(float(missed / tot), 3),       # recall hole
            "confused_frac": round(float(confused / tot), 3),   # mislabeled as another class
            "false_positives": int(cm[j][bg]),                  # bg predicted as this class
        }

    return {"overall": overall, "per_class": per_class, "confusions": confusions,
            "breakdown": breakdown, "confusion_labels": labels,
            "confusion_matrix": cm.astype(int).tolist()}


# --- field-extraction eval (subsample) ----------------------------------------------------

def _subsample(n):
    val = [l.strip() for l in (DATASET / "val.txt").read_text().splitlines() if l.strip()]
    if n >= len(val):
        return val
    stride = len(val) / n
    return [val[int(i * stride)] for i in range(n)]


def _oracle_record(image_path, gt_boxes, ocr_reader):
    """Assemble a record from PERFECT (GT) boxes — the detection ceiling."""
    import cv2
    from app.field_extractor import _pad_box
    from app.field_assembly import assemble
    img = cv2.imread(str(image_path))
    if img is None:
        return None
    h, w = img.shape[:2]
    fields = []
    for b in gt_boxes:
        x1, y1, x2, y2 = _pad_box(b["bbox"], w, h)
        if x2 <= x1 or y2 <= y1:
            continue
        crop = img[y1:y2, x1:x2]
        text = ocr_reader(crop) if crop.size else ""
        fields.append({"cls": b["cls"], "bbox": b["bbox"], "text": text, "conf": 1.0})
    return assemble(fields)


def run_field_eval(n):
    import cv2
    from app.field_extractor import extract, _real_ocr_reader

    samples = _subsample(n)
    rows = []
    agg = {
        "vendor_real": 0, "vendor_oracle": 0,
        "date_real": 0, "date_oracle": 0,
        "total_real": 0, "total_oracle": 0,
        "tax_real": 0, "tax_oracle": 0,
        "item_inflation_real": [], "item_inflation_oracle": [],
        "n": 0,
    }
    for idx, rel in enumerate(samples, 1):
        image_path = DATASET / rel
        stem = Path(rel).stem
        img = cv2.imread(str(image_path))
        if img is None:
            print(f"[{idx}/{len(samples)}] SKIP unreadable {rel}", flush=True)
            continue
        h, w = img.shape[:2]
        gt = _read_gt_boxes(stem, w, h)
        gt_item_count = sum(1 for b in gt if b["cls"] == ITEM_CLASS)

        # IMPORTANT ordering: run YOLO (torchvision NMS) BEFORE Paddle OCR. If Paddle initialises
        # first in-process, torchvision.ops.nms crashes ("Tensor holds no memory") — a Paddle/Torch
        # native-lib coexistence bug. extract() runs YOLO first, so do it before the oracle OCR.
        t0 = time.time()
        real = extract(str(image_path))
        oracle = _oracle_record(image_path, gt, _real_ocr_reader)
        dt = time.time() - t0

        # --- compare against each other + against GT item count ---
        o_total, r_total = oracle.get("total"), real.get("total")
        o_tax, r_tax = oracle.get("tax"), real.get("tax")
        o_items, r_items = len(oracle.get("items", [])), len(real.get("items", []))

        # oracle is our best "truth proxy" for header strings (perfect boxes)
        vendor_ok = _str_match(real.get("vendor"), oracle.get("vendor"))
        date_ok = _str_match(real.get("date"), oracle.get("date"))
        total_ok = _num_match(r_total, o_total)
        tax_ok = _num_match(r_tax, o_tax)

        agg["n"] += 1
        agg["vendor_real"] += int(bool(_norm(real.get("vendor"))))
        agg["vendor_oracle"] += int(bool(_norm(oracle.get("vendor"))))
        agg["date_real"] += int(bool(_norm(real.get("date"))))
        agg["date_oracle"] += int(bool(_norm(oracle.get("date"))))
        agg["total_real"] += int(r_total is not None)
        agg["total_oracle"] += int(o_total is not None)
        agg["tax_real"] += int(r_tax is not None)
        agg["tax_oracle"] += int(o_tax is not None)
        if gt_item_count > 0:
            agg["item_inflation_real"].append(r_items - gt_item_count)
            agg["item_inflation_oracle"].append(o_items - gt_item_count)

        row = {
            "image": stem, "seconds": round(dt, 1),
            "gt_item_count": gt_item_count,
            "items_oracle": o_items, "items_real": r_items,
            "total_gt_via_oracle": o_total, "total_real": r_total, "total_match": total_ok,
            "tax_via_oracle": o_tax, "tax_real": r_tax, "tax_match": tax_ok,
            "vendor_real": real.get("vendor"), "vendor_oracle": oracle.get("vendor"),
            "vendor_match": vendor_ok, "date_match": date_ok,
            "gt_boxes": len(gt), "real_boxes": len(real.get("detected_fields", [])),
        }
        rows.append(row)
        print(f"[{idx}/{len(samples)}] {stem} {dt:.0f}s | items gt={gt_item_count} "
              f"oracle={o_items} real={r_items} | total o={o_total} r={r_total} "
              f"match={total_ok} | vendor_match={vendor_ok}", flush=True)

    def _rate(num):
        return round(num / agg["n"], 3) if agg["n"] else 0.0

    def _mean(xs):
        return round(sum(xs) / len(xs), 2) if xs else None

    summary = {
        "n": agg["n"],
        "total_match_rate": _rate(agg["total_real"]),  # real total present & matching oracle counted below
        "header_presence": {
            "vendor": {"real": _rate(agg["vendor_real"]), "oracle": _rate(agg["vendor_oracle"])},
            "date": {"real": _rate(agg["date_real"]), "oracle": _rate(agg["date_oracle"])},
            "total": {"real": _rate(agg["total_real"]), "oracle": _rate(agg["total_oracle"])},
            "tax": {"real": _rate(agg["tax_real"]), "oracle": _rate(agg["tax_oracle"])},
        },
        "value_match_real_vs_oracle": {
            "total": round(sum(1 for r in rows if r["total_match"]) / len(rows), 3) if rows else 0,
            "tax": round(sum(1 for r in rows if r["tax_match"]) / len(rows), 3) if rows else 0,
            "vendor": round(sum(1 for r in rows if r["vendor_match"]) / len(rows), 3) if rows else 0,
            "date": round(sum(1 for r in rows if r["date_match"]) / len(rows), 3) if rows else 0,
        },
        "item_inflation": {
            "real_mean": _mean(agg["item_inflation_real"]),
            "oracle_mean": _mean(agg["item_inflation_oracle"]),
            "note": "items_predicted - gt_item_box_count; oracle isolates pure assembly error",
        },
    }
    return {"summary": summary, "rows": rows}


# --- main ---------------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["detection", "field", "all"], default="all")
    ap.add_argument("--n", type=int, default=12, help="field-eval subsample size")
    ap.add_argument("--out", default=str(BACKEND / "eval" / "results.json"))
    args = ap.parse_args()

    report = {}
    if args.mode in ("detection", "all"):
        print("=== DETECTION EVAL (full val) ===", flush=True)
        report["detection"] = run_detection_eval()
        print(json.dumps(report["detection"], indent=2), flush=True)
    if args.mode in ("field", "all"):
        print(f"\n=== FIELD EVAL (subsample n={args.n}) ===", flush=True)
        report["field"] = run_field_eval(args.n)
        print("\n--- field summary ---", flush=True)
        print(json.dumps(report["field"]["summary"], indent=2), flush=True)

    Path(args.out).write_text(json.dumps(report, indent=2))
    print(f"\nwrote {args.out}", flush=True)


if __name__ == "__main__":
    main()
