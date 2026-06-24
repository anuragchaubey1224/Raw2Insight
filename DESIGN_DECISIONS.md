# Raw2Insight — Design Decisions Log

> A running record of architectural and product decisions for the Raw2Insight upgrade.
> Goal: turn the existing deployed prototype into a polished, product-like document-intelligence
> tool that holds up to recruiter / interview scrutiny.
>
> **Only hard constraint:** must keep working on the existing free deployment
> (Hugging Face Spaces backend + Vercel frontend). Everything else is flexible.

_Last updated: 2026-06-24_

---

## 0. Context

Raw2Insight extracts structured data (vendor, date, total, line items) from receipts/invoices.

- **Backend:** FastAPI, 6-phase pipeline (preprocess → OCR → table detect → parse → schema → insights)
- **OCR:** PaddleOCR · **Detection:** YOLOv8 · **Classic ML:** TF-IDF+LogReg categorizer, IsolationForest anomalies
- **Frontend:** React 18 + Vite, JWT auth, polling-based status
- **Deployed:** Vercel (frontend) + Hugging Face Spaces (backend, CPU-only free tier) + PostgreSQL

---

## 1. Phase 1 — Repo cleanup  ✅ DONE (2026-06-24)

- Removed ~22 AI-generated junk docs from root → kept only `README.md`, `DEPLOYMENT.md`.
- Removed duplicate `raw2insight-backend/` folder (was byte-identical to `backend/app/`).
- De-duplicated `yolov8n.pt` (3 copies → 1).
- Deleted `.DS_Store`, `app.log`, `__pycache__`, stray `.env.huggingface`.
- All removed files backed up (recoverable) before deletion.

**Key insight discovered:** the *committed* GitHub repo (65 files) was already clean of junk —
all the clutter was local/untracked. BUT the repo has **no root `README.md` committed** and **no
`LICENSE` file**, and `notebooks/` (the data-prep + training pipeline) is not committed either.
→ These should be committed in the README phase.

---

## 2. Feature — Batch processing  (decided, not yet built)

**Why:** the "product" moment. Example: a restaurant owner has 20 order slips → uploads them →
gets one table of extracted data → downloads it. One bill type for now (no multi-domain generalization).

### Locked decisions

| Topic | Decision | Rationale |
|-------|----------|-----------|
| **Batch limit** | Max **10 bills per batch** (1 bill = 1 image OR 1 PDF page) | Bounds free-tier compute; intuitive rule; good demo length |
| **PDF** | Allowed, max 10 pages; each page = 1 bill; counts toward the 10-bill cap | Prevents 10 PDFs × 10 pages = 100 bills loophole |
| **Single + Batch** | Keep both, user toggles on the upload page | Flexibility; doesn't remove existing UX |
| **Backward compatibility** | **Additive only.** Existing `/upload`, `/status`, `/result`, `/download` untouched. New `/batch/...` endpoints added. Internally, single-upload becomes a "batch of 1" sharing one processing core. | Live deployment must not break; shows senior "no breaking changes" thinking |
| **Editing** | Inline edit in the batch results table | Lets users correct extractions |
| **Download** | CSV **and** Excel (`.xlsx`) | Excel adds a "business tool" feel |
| **Results UX** | Interactive **table** (sort / filter / expand row / edit) is the centerpiece; download = export of that table | This *is* the product feel |
| **Processing model** | **Sequential, with a configurable concurrency knob** (`MAX_CONCURRENCY=1` on free tier) | See §3 |
| **Per-slip failure** | Isolated — one bad slip is flagged, the rest of the batch continues | Real products never fail a whole batch on one bad row |

### Architecture solidification bundled with batch
- Move job/batch status from **in-memory dict → DB-backed** (survives HF restart/sleep; #1 reliability fix).
- Add a `Batch` table (`batch_id`, `user_id`, total/done/failed counts, status); link `Document` rows to it.
- Split monolithic `main.py` (1882 lines) into routers (`auth_router`, `batch_router`, `document_router`).
- Fix bare `except:` clauses + add proper logging.

---

## 3. Sequential vs Parallel processing — interview-ready reasoning

**Decision: sequential processing, concurrency as a config knob (default 1 on free tier).**

Why this is a *deliberate* choice, not a limitation:

- Free tier = ~2 vCPU, CPU-only. The workload (PaddleOCR + YOLO) is **CPU-bound**.
- PaddleOCR and YOLO/PyTorch are **already internally multi-threaded** — a single document's
  inference saturates all cores. Running documents "in parallel" makes them contend for the same
  cores → no throughput gain, and **multiplies memory** (multiprocessing reloads ~1–2 GB of models
  per process → OOM risk on free tier).
- Correct way to scale this = **horizontal** (more worker instances/replicas behind a queue, e.g.
  Celery workers), not threads on one box.
- Sequential also gives **predictable memory, per-document failure isolation, and a clean live
  "X / N done" progress signal** (which is actually better for a live demo).

**When parallel *would* help (know the nuance):** if OCR were an external API call (I/O-bound) or if
a GPU were available (batched inference). The right answer depends on the bottleneck — here it's CPU.

**Design note:** processing is written so concurrency is a knob — on a bigger box, set
`MAX_CONCURRENCY=4` and it parallelizes with no code change.

---

## 4. Open question — Accuracy of the current pipeline  (under analysis 2026-06-24)

Will the *existing* OCR → detection → rule-based-parser pipeline actually extract bills accurately?
Are any tool/design choices wrong? **Deep code analysis completed 2026-06-24** (3 parallel code reviews).

### TL;DR verdict

**The current extraction core will NOT give reliable accuracy on varied receipts.** It is tuned to
roughly ONE receipt format and is the classic *brittle rule-based trap*. The OCR engine choice is
fine; the problem is everything downstream of it (detection + parsing) plus zero measured accuracy.

### Stage-by-stage scorecard

| Stage | Tool | Verdict | Core problem |
|-------|------|---------|--------------|
| OCR | PaddleOCR | 🟢 **Good choice, keep it** | But no confidence filtering — garbage tokens kept as-is |
| Preprocessing | OpenCV | 🟠 Too aggressive | Bilateral kernel=9 + adaptive-threshold-on-by-default + CLAHE+sharpen stack can *destroy* faint thermal text; hardcoded DPI/resize |
| Table detection | YOLOv8 | 🔴 **Broken** | Loads **vanilla `yolov8n.pt` (COCO: person/car)**, not a table model. ~90% of the time it detects nothing → dumb fallback that crops a hardcoded 30%–80% slice of the image |
| Custom trained model | `table_detector_best.pt` | 🔴 **Dormant** | A real field-detector was trained but is **referenced nowhere** in the pipeline |
| Parsing | 2789-line rule engine | 🔴 **Brittle / overfit** | KMeans columns capped at 4, 10px row threshold, English-only keyword lists, currency **defaults to MYR**, and — the smoking gun — **hardcoded per-dish corrections** (`if 'tandoori chicken' … line_total = 309.75`) for ONE specific restaurant |
| Categorizer | TF-IDF + LogReg | 🟠 Toy | Trained on **77 hardcoded samples** (~7/class) |
| Anomaly detection | IsolationForest + rules | 🟠 ~70% hardcoded | Magic thresholds (`price>10000`, `qty>100`); IsolationForest only runs with >5 history rows |
| Evaluation | `evaluation.py` | 🔴 **Never runs** | CER/WER/mAP/field-accuracy functions exist but are **never called** → **no accuracy was ever measured anywhere** |

### The 3 critical problems (in priority order)

1. **🔴 The trained model isn't wired in.** Pipeline uses COCO `yolov8n.pt`, so "table detection"
   is effectively a hardcoded crop. The asset that proves ML skill sits unused in `backend/tests/`.
2. **🔴 Hardcoded per-receipt corrections** in `parser.py` (`tandoori chicken`, `lasooni dal tadka`).
   This is an *admission* the parser doesn't generalize. **Must be deleted** — a recruiter reading
   this concludes the system is faked to one demo receipt.
3. **🔴 Zero measured accuracy.** Every "accuracy/ML" claim in the README is currently unverifiable.
   No mAP, no field-accuracy, no test set. This is the #1 credibility gap.

### Where I (deliberately) disagree with the raw analysis

- **Do NOT swap PaddleOCR → EasyOCR.** PaddleOCR (PP-OCRv4/v5) is best-in-class open-source OCR.
  The real OCR-stage fixes are: turn off aggressive preprocessing by default + add a confidence
  threshold. Engine swap is wasted effort.
- The precise error-rate numbers in the sub-reports are *illustrative*, not measured — directionally
  correct (preprocessing hurts thermal receipts) but treat them as hypotheses to verify with a real
  test set, not facts.

### Recommended architecture (the honest path to a real "product")

Rule-based parsing cannot reach product-grade accuracy on varied receipts within a CPU-only budget.
The realistic 2026 options:

- **Vision-LLM extraction** (image → LLM with a structured-output schema → JSON). Most accurate &
  robust, handles any format/language, and **offloads heavy compute off the free CPU box** (the API
  does the work) — so it actually *fits* the HF constraint better than local OCR+YOLO.
- **Wire in + benchmark the custom YOLO field-detector** so the "I trained my own model" claim
  becomes TRUE and measured (report mAP@0.5). This is the ML-depth showcase.
- **Keep PaddleOCR + a cleaned rule parser as a no-API-key fallback** → lets you demo "rule-based vs
  LLM" side by side (a strong interview talking point) and keeps the app working without a key.

**Leaning recommendation: Hybrid** = VLM as the primary extractor (accuracy + product feel),
custom-trained YOLO wired in & benchmarked (ML credibility), OCR+rules as fallback. Plus a real
50–100 receipt eval set with field-level accuracy reported in the README.

**Immediate non-negotiables regardless of path:**
- Delete the hardcoded per-dish corrections in `parser.py`.
- Wire in (or remove) `table_detector_best.pt` — don't ship a COCO model pretending to detect tables.
- Build a small labelled eval set and actually report numbers.

### ✅ DECISION: Hybrid architecture (chosen 2026-06-24)

**Primary extractor = Vision-LLM** (image + optional OCR hint → structured JSON via a schema).
**Custom-trained YOLO field-detector = wired in + benchmarked** (mAP@0.5 reported) — serves as the
ML-credibility showcase and a visual "detected fields" overlay + cross-check signal, NOT the accuracy
workhorse. **PaddleOCR + cleaned rule-parser = fallback** when no API key / LLM unavailable.

Data flow per bill:
```
image → [clean preprocess + PaddleOCR (confidence-filtered) as text hint]
      → PRIMARY: Vision-LLM (structured schema) → {vendor,date,total,tax,currency,items[]}
      → Custom YOLO field-detector (parallel) → field bboxes → mAP metric + UI overlay + cross-check
      → if no key / LLM fails → FALLBACK: cleaned rule parser
      → structured JSON → DB → batch table → CSV/Excel
```

Why hybrid fits all constraints:
- **Accuracy:** VLM handles format/language/currency variation natively (rule parser can't).
- **HF free tier:** heavy lifting moves to the LLM API → backend CPU stays light.
- **Resume:** tells BOTH stories — classic CV/ML (trained YOLO + OCR, measured mAP) AND modern AI (VLM
  with structured output), plus a "rule-based vs LLM" comparison talking point.

**Immediate non-negotiables (any path):**
- ❌ Delete hardcoded per-dish corrections in `parser.py`.
- 🔌 Wire in (or remove) `table_detector_best.pt` — no COCO model masquerading as a table detector.
- 📏 Build a 50–100 receipt labelled eval set; report field-level accuracy + YOLO mAP in README.
- 🎚️ Add OCR confidence filtering; turn off aggressive preprocessing by default. (Keep PaddleOCR.)

**Provider choice for the VLM:** _pending (cost vs quality decision)._ Architecture will use a
provider-agnostic adapter regardless, so the default can be swapped without code changes.

### 🔁 REFINEMENT (2026-06-24): "Real work first, not an API wrapper"

User constraint added: the project must showcase **genuine engineering/ML work the user did**, NOT
rely on an external API as the core. → **Weighting flipped:**

- **PRIMARY core (the real work, runs 100% locally on CPU, no API):**
  Custom-trained **YOLOv8 KIE field-detector** (detects WHERE each field is: COMPANY/DATE/TOTAL/ITEM/
  QTY/UNIT_PRICE/LINE_TOTAL…) → **PaddleOCR** reads text inside each detected box → a **spatial
  field-assembly algorithm** (the user's own logic) groups same-row ITEM/QTY/PRICE boxes into line
  items → structured JSON. This is a *learned* KIE pipeline — fundamentally different from (and a
  replacement for) the old brittle 2789-line rule parser.
- **SECONDARY (optional, OFF by default): Vision-LLM** as (a) a fallback only for low-confidence /
  missing fields, (b) a **benchmark baseline** in the report ("my pipeline vs a VLM"), and optionally
  (c) a dev-time tool to bootstrap more training labels. **The product works with the API disabled.**

This keeps the API clearly a *cherry on top*, not the cake. Resume narrative becomes: "I trained my
own field-detector, built an OCR+assembly extraction pipeline, measured it (mAP + field accuracy),
and benchmarked it against a VLM" — that is real, defensible work.

**Real-work components the user can legitimately claim:**
1. Custom YOLOv8 field-detector (data-prep notebooks + training + mAP@0.5).
2. OCR integration + receipt-specific preprocessing + confidence handling.
3. Spatial field-assembly algorithm (boxes + text → structured line items).
4. Evaluation harness with real field-level accuracy metrics.
5. Batch processing system (DB-backed jobs, sequential worker, per-item isolation).
6. Full-stack + live deployment.

**Critical first dependency:** benchmark `table_detector_best.pt` on the val set FIRST. Its mAP
decides whether it's good enough to be the core or needs retraining. Everything hinges on this.

**Open fork → RESOLVED (2026-06-24):** Keep the VLM as an **optional, OFF-by-default** secondary
layer (benchmark baseline + low-confidence fallback). The product runs fully without any API. Custom
YOLO + OCR + assembly is the locked primary core.

---

## 5. Locked architecture summary (final)

| Component | Role | Runs where |
|-----------|------|-----------|
| Custom YOLOv8 field-detector | **Primary** — locate fields | Local CPU, no API |
| PaddleOCR (conf-filtered) | Read text in detected boxes | Local CPU, no API |
| Spatial assembly algorithm | Boxes + text → structured records | Local CPU, no API |
| Cleaned rule parser | Legacy fallback (de-hardcoded) | Local CPU, no API |
| Vision-LLM | **Optional, OFF by default** — baseline + hard-case fallback | External API (toggle) |
| Eval harness | Field accuracy + YOLO mAP, reported in README | Local |
| Batch system | DB-backed jobs, sequential worker, per-item isolation, max 10 bills | Local CPU |

**Step 0 update (2026-06-25):** `table_detector_best.pt` turned out to be a renamed copy of vanilla
`yolov8n.pt` (COCO classes, MD5-identical) — **no custom model ever existed.** We trained our own
YOLOv8n field-detector from the cleaned dataset on Colab (GPU).

### ✅ Training results — custom YOLOv8n field-detector (2026-06-25)

Dataset: 501 train / 125 val (clean split, no leakage), 12 classes, 100 epochs (patience 20).
Raising input resolution 640 → 960 improved every class (receipts are tall/narrow — small fields
benefit from higher resolution):

| Metric | imgsz 640 | **imgsz 960 (final model)** |
|--------|-----------|------------------------------|
| mAP@0.5 | 0.728 | **0.782** |
| mAP@0.5:0.95 | 0.519 | **0.572** |

Final (imgsz 960) per-class mAP@0.5:
TAX 0.960 · LINE_TOTAL 0.954 · ITEM 0.931 · COMPANY 0.927 · DATE 0.904 · OTHER 0.879 ·
QTY 0.857 · ADDRESS 0.854 · CASHIER 0.765 · DOCUMENT_NO 0.758 · TOTAL 0.593 · **UNIT_PRICE 0.000**
(only 1 labelled example — derive `unit_price = line_total / qty` instead).

Model file verified real: `best.pt` MD5 `c611b997…` (≠ vanilla yolov8n), 12 receipt classes, no
COCO classes. Currently at `backend/tests/best.pt`; Phase 2 moves it to `backend/models/` and wires it in.

Resume-ready: *"Trained a YOLOv8 receipt field-detector (12 classes, 626 images); improved mAP@0.5
from 0.73 → 0.78 by raising input resolution to 960; key fields (tax, line-items, vendor) 0.85–0.96."*

**Lesson learned:** Colab free tier wipes `/content` on disconnect — always train with
`project=` pointing at Google Drive so `best.pt` persists. (First run's model was lost this way; the
numbers above are recorded here and will reproduce on retrain.)
