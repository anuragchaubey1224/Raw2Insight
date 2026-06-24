# Raw2Insight — System Architecture

> **AI-powered document-intelligence platform** that turns receipts/invoices into structured,
> downloadable data. This document describes the **target architecture** being implemented
> (see [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md)); the reasoning behind each choice lives
> in [`DESIGN_DECISIONS.md`](./DESIGN_DECISIONS.md).

The core extraction runs **entirely on CPU with no external API** — a custom-trained YOLOv8 field
detector + PaddleOCR + a spatial-assembly algorithm. A Vision-LLM is available as an **optional,
opt-in** engine, never a dependency.

---

## Design principles

| Principle | What it means |
|-----------|---------------|
| 🔁 **Additive / backward-compatible** | New features never break the live deployment; existing endpoints keep working |
| 🧠 **Local-first core** | The real extraction work runs on CPU with no API calls |
| 🔌 **Pluggable engine** | Users choose `local` ML, optional `llm`, or `compare` mode at request time |
| 📏 **Measured** | Every accuracy claim is backed by a benchmark (mAP, field accuracy) |
| 🛡️ **Reliable** | DB-backed job state (survives restarts) + per-item failure isolation |

**Legend:** solid arrows = always-on data flow · dashed arrows = optional / off-by-default.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, React Router, Tailwind CSS, Axios |
| Backend | FastAPI, SQLAlchemy, JWT (bcrypt), SlowAPI rate limiting |
| ML / CV | **Custom YOLOv8 field-detector**, PaddleOCR, OpenCV, scikit-learn |
| Optional | Pluggable Vision-LLM adapter (off by default) |
| Data | PostgreSQL (Neon/Supabase), ephemeral `tmp/` for crops/results |
| Infra | Hugging Face Spaces (Docker) · Vercel · GitHub Actions CI |

---

## 1. System architecture (high level)

The platform is a classic three-tier system (client → API → data) with a dedicated **CPU-only
processing core** and an **optional external LLM** that is wired in but disabled by default.

```mermaid
flowchart TB
    subgraph CLIENT["🖥️ Client Layer — Vercel"]
        UI["React 18 + Vite SPA<br/>Upload · Batch Table · Results · Auth"]
    end

    subgraph APIL["⚡ API Layer — Hugging Face Spaces (Docker)"]
        GW["FastAPI Gateway<br/>JWT auth · rate limiting · CORS"]
        AR["auth_router"]
        DR["document_router"]
        BR["batch_router"]
        SR["system_router"]
        WK["Background Worker<br/>sequential · MAX_CONCURRENCY knob"]
    end

    subgraph CORE["🧠 Processing Core — CPU-only, no API"]
        ENG["Engine Selector<br/>local / llm / compare"]
        EX["Extraction Engine<br/>see Diagram 3"]
    end

    subgraph DATA["🗄️ Data Layer"]
        PG[("PostgreSQL<br/>Users · Batches · Documents")]
        FS["Ephemeral tmp/<br/>uploads · crops · results"]
    end

    subgraph EXT["☁️ Optional External — OFF by default"]
        LLM["Vision-LLM Provider<br/>pluggable adapter"]
    end

    UI -->|"HTTPS / REST + JWT"| GW
    GW --> AR & DR & BR & SR
    DR --> WK
    BR --> WK
    WK --> ENG
    ENG --> EX
    ENG -.->|"engine = llm / compare"| LLM
    EX --> PG
    WK --> PG
    EX --> FS
    AR --> PG
```

**Notes**
- The **Background Worker** decouples slow ML processing from the HTTP request → the API responds
  instantly with a `batch_id` and the client polls for progress.
- The **LLM** sits behind the Engine Selector and is reached only when the user opts in.

---

## 2. Request & data flow

Upload is non-blocking: the API persists job state, kicks off background processing, and the client
polls until the batch completes.

```mermaid
sequenceDiagram
    actor U as User
    participant FE as Frontend
    participant API as FastAPI Gateway
    participant WK as Background Worker
    participant CORE as Extraction Core
    participant DB as PostgreSQL

    U->>FE: Select bill(s) + engine, click Upload
    FE->>API: POST /batch/upload (files, engine)
    API->>DB: Create Batch + Document rows (processing)
    API-->>FE: 202 Accepted, returns batch_id
    API->>WK: enqueue background job

    loop For each bill (sequential)
        WK->>CORE: process bill with selected engine
        CORE-->>WK: fields + confidence
        WK->>DB: update Document + batch counters
    end

    loop Poll every ~3s
        FE->>API: GET batch status
        API->>DB: read counters
        API-->>FE: done X of N
    end

    FE->>API: GET /batch/{id}/results
    API->>DB: fetch documents
    API-->>FE: rows for the table
    U->>FE: Edit inline / Download (CSV · Excel)
```

---

## 3. Extraction core ⭐ (the real work)

This is the heart of the project and the main differentiator. Instead of guessing columns from raw
OCR text (the old brittle approach), a **custom-trained detector labels each field's class**, so the
class itself tells us what every value is — `QTY`, `UNIT_PRICE`, `LINE_TOTAL`, `TOTAL`, etc.

```mermaid
flowchart TB
    IMG["📄 Bill image / PDF page"] --> PRE["Preprocessing<br/>gentle: deskew · light contrast<br/>aggressive ops OFF by default"]
    PRE --> DET["🎯 Custom YOLOv8 Field-Detector<br/>12 classes: COMPANY · DATE · TOTAL · TAX<br/>ITEM · QTY · UNIT_PRICE · LINE_TOTAL …"]

    DET --> CROP["✂️ Crop each detected box (padded)"]
    CROP --> OCR["🔤 PaddleOCR per crop<br/>+ confidence filter"]
    OCR --> CLEAN["🧹 Field-type-aware cleaning<br/>numeric fix O→0, l→1 ONLY in number fields"]
    CLEAN --> ASM["🧩 Spatial Assembly<br/>group same-row boxes → line items<br/>class = column, no fragile clustering"]
    ASM --> VAL["✅ Validation<br/>qty×price ≈ line_total · Σitems+tax ≈ total<br/>→ per-field confidence"]
    VAL --> OUT["📦 Structured JSON<br/>vendor · date · total · items[] · confidence"]

    DET -->|"too few fields detected"| FB["🛟 Fallback: de-hardcoded rule parser"]
    FB --> OUT

    DET -.->|"benchmarked offline"| MET["📏 mAP@0.5 metric<br/>reported in README"]
    DET -.->|"rendered in UI"| OVL["🖼️ Detected-fields overlay<br/>boxes drawn on the receipt"]
```

**Why this is accurate (and not just rules):**
1. **Detector knows the field class** → no column guessing.
2. **Crop-then-OCR** → OCR reads a small clean region, far more reliable than full-image OCR.
3. **Field-type-aware cleaning** → numeric corrections are applied *only* inside number fields.
4. **Math cross-checks** → catch OCR errors and produce a confidence score per field.

See [`IMPLEMENTATION_PLAN.md` › Appendix A](./IMPLEMENTATION_PLAN.md) for the full accuracy playbook.

---

## 4. Pluggable processing engine

A request-time `engine` parameter routes processing. The default is the local ML pipeline; the LLM is
strictly opt-in. `compare` runs both and is the demo centerpiece — it visually proves the custom
pipeline matches a state-of-the-art VLM.

```mermaid
flowchart LR
    REQ["Request<br/>engine = ?"] --> Q{engine}
    Q -->|"local — default"| L["⚙️ Custom Pipeline<br/>YOLO + OCR + assembly<br/>no API"]
    Q -->|"llm — opt-in"| M["🤖 Vision-LLM<br/>image → structured JSON"]
    Q -->|"compare"| C["⚖️ Run BOTH"]
    C --> L
    C --> M
    L --> RES["Structured result"]
    M --> RES
    C --> CMP["Side-by-side + agreement %"]
    CMP --> RES
```

---

## 5. Batch processing

The product feature: many bills in, one table out. Bills are processed **sequentially** (the correct
choice for CPU-bound ML on a 2-vCPU box — see `DESIGN_DECISIONS.md` §3) with **per-item isolation** so
one bad slip never fails the whole batch.

```mermaid
flowchart TB
    UP["POST /batch/upload<br/>files + engine"] --> CNT["Count bills<br/>images + PDF pages"]
    CNT --> CAP{"≤ 10 bills?"}
    CAP -->|No| REJ["❌ Reject<br/>Max 10 bills per batch"]
    CAP -->|Yes| MK["Create Batch + N Documents<br/>DB-backed status"]
    MK --> WORK["Sequential worker"]

    subgraph LOOP["Per bill — isolated"]
        TRY["try: process(bill, engine)"] --> OKQ{success?}
        OKQ -->|Yes| DONE["✅ done — save fields"]
        OKQ -->|No| FAIL["⚠️ failed — flag, continue"]
    end

    WORK --> LOOP
    DONE --> UPD["Update batch counters"]
    FAIL --> UPD
    UPD --> AGG["Aggregate table<br/>1 row per bill"]
    AGG --> EXP["Export · CSV · Excel"]
```

> **Backward compatibility:** single upload is internally a *batch of 1* sharing the same core, so the
> existing `/upload`, `/status`, `/result`, `/download` endpoints stay fully functional.

---

## 6. Data model

```mermaid
erDiagram
    USER ||--o{ BATCH : owns
    USER ||--o{ DOCUMENT : owns
    BATCH ||--o{ DOCUMENT : contains

    USER {
        int id PK
        string email UK
        string password_hash
        string full_name
        datetime created_at
        bool is_active
    }
    BATCH {
        string batch_id PK
        int user_id FK
        int total_count
        int done_count
        int failed_count
        string status
        string engine
        datetime created_at
    }
    DOCUMENT {
        int id PK
        int user_id FK
        string batch_id FK
        string job_id UK
        string filename
        string status
        string vendor
        string date
        string total_amount
        int item_count
        text extracted_data
        float confidence
        text error_message
        datetime created_at
    }
```

The `BATCH` table is the new addition that turns a per-file system into a grouped, product-grade one.
Job/batch status lives **in the database** (not an in-memory dict) so it survives Hugging Face Space
restarts and sleeps.

---

## 7. Deployment topology

```mermaid
flowchart TB
    subgraph DEV["👨‍💻 Source & CI"]
        GH["GitHub<br/>anuragchaubey1224/Raw2Insight"]
        CI["GitHub Actions<br/>lint · pytest"]
    end

    subgraph VERCEL["▲ Vercel — Frontend CDN"]
        FE["React SPA<br/>raw2-insight.vercel.app"]
    end

    subgraph HF["🤗 Hugging Face Spaces — Docker"]
        BE["FastAPI backend<br/>…raw2insight-backend.hf.space"]
        MODELS["Bundled models<br/>YOLO field-detector · sklearn"]
    end

    subgraph CLOUD["☁️ Managed PostgreSQL"]
        PG[("Neon / Supabase")]
    end

    GH --> CI
    CI -->|deploy| FE
    CI -->|deploy| BE
    FE -->|"REST + JWT"| BE
    BE --> MODELS
    BE -->|"SQLAlchemy"| PG
    BE -.->|"ENABLE_LLM — opt-in"| LLMP["Vision-LLM API"]
```

**Free-tier aware:** the backend is CPU-only, so the architecture keeps heavy work bounded
(sequential processing, lightweight YOLO-nano) and treats `tmp/` as ephemeral — the database is the
single source of truth.

---

## Where to go next

- **Reasoning & decisions:** [`DESIGN_DECISIONS.md`](./DESIGN_DECISIONS.md)
- **Build plan & phases:** [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md)
