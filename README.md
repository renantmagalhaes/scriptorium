# Scriptorium

A self-hosted document archive with OCR and full-text search. Point it at a read-only folder of PDFs, images, and Office files; it extracts text in the background and gives you a fast search UI over everything.

---

## What it does

- **Automatic indexing** — a scanner polls your corpus directory at a configurable interval and enqueues any new or changed files
- **Multi-format OCR** — PDFs (including digitally signed and custom-font-encoded ones), images, DOCX, XLSX, ODS
- **Full-text search** with five ranked match modes: phrase/boolean FTS, prefix matching, trigram substring, digit-normalised numeric search, and single-word fuzzy/typo tolerance
- **Text editor** — view the raw OCR output per page, correct mistakes, and revert to the original at any time; corrections update search immediately
- **File viewer** — inline preview and download for any indexed file
- **Single-user auth** via JWT — no user management, just a username and password

---

## Architecture

```
                     ┌──────────────┐
  Browser ──HTTPS──► │ ext. Nginx   │  (not part of this stack)
                     └──────┬───────┘
                            │ HTTP
                     ┌──────▼───────┐
                     │   web        │  FastAPI + built React UI
                     └──┬───────┬───┘
                        │       │
               ┌────────▼──┐ ┌──▼────────┐
               │ postgres  │ │   redis   │
               └────────▲──┘ └──▲────────┘
                        │       │
               ┌────────┴──┐ ┌──┴────────┐
               │  scanner  │ │ocr-worker │ (N replicas)
               └───────────┘ └───────────┘
                        │           │
                   ╔════▼═══════════▼════╗
                   ║  /corpus  (NFS :ro) ║
                   ╚═════════════════════╝
```

| Service | Role |
|---|---|
| `web` | FastAPI backend + Vite-built React SPA served as static files |
| `postgres` | Document catalog + extracted text + FTS indexes (`pg_trgm`) |
| `redis` | OCR job queue |
| `scanner` | Polls corpus via `os.walk`/`stat`; no inotify, safe over NFS |
| `ocr-worker` | Pulls jobs from Redis; runs OCRmyPDF → Tesseract; writes extracted text to Postgres |

Postgres and Redis have **no published host ports** — internal Docker network only.

---

## Requirements

- Docker and Docker Compose v2
- A directory of documents (NFS share, local path, etc.) readable by uid `1000`
- An external reverse proxy (Nginx, Caddy, …) for TLS termination — the stack exposes plain HTTP

---

## Getting started

### 1. Clone and configure

```bash
git clone <repo-url> scriptorium
cd scriptorium
cp env.example .env
```

Edit `.env` — every value with `changeme` **must** be changed before first run.

### 2. Generate a secret key

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Paste the output as `SECRET_KEY` in `.env`.

### 3. Start the stack

```bash
docker compose up -d
```

On first start Postgres runs `postgres/init.sql`, which creates the schema and indexes. The scanner fires within a few seconds and begins enqueuing files; OCR workers pick them up immediately.

### 4. Open the UI

Navigate to `http://<your-host>:<WEB_PORT>` (default `8000`) and log in with the `UI_USERNAME` / `UI_PASSWORD` you set.

---

## Environment variables

All variables live in `.env` (copied from `env.example`). `.env` is gitignored and never baked into images.

### Database

| Variable | Required | Default | Description |
|---|---|---|---|
| `POSTGRES_USER` | yes | — | PostgreSQL username |
| `POSTGRES_PASSWORD` | yes | — | PostgreSQL password |
| `POSTGRES_DB` | no | `scriptorium` | Database name |

### Redis

| Variable | Required | Default | Description |
|---|---|---|---|
| `REDIS_PASSWORD` | yes | — | Redis AUTH password |

### Web / auth

| Variable | Required | Default | Description |
|---|---|---|---|
| `UI_USERNAME` | yes | — | Login username for the web UI |
| `UI_PASSWORD` | yes | — | Login password for the web UI |
| `SECRET_KEY` | yes | — | 64-char hex string used to sign JWTs — generate once, never change |
| `WEB_PORT` | no | `8000` | Host port the web container publishes |

### Corpus

| Variable | Required | Default | Description |
|---|---|---|---|
| `CORPUS_PATH` | yes | — | Absolute path on the Docker host to your document directory. Mounted `:ro` into every container — **originals are never written, moved, or deleted** |

### Scanner

| Variable | Required | Default | Description |
|---|---|---|---|
| `SCAN_INTERVAL` | no | `300` | Seconds between corpus scans |
| `MISS_THRESHOLD` | no | `2` | Consecutive scan misses before a file is removed from the catalog. Only applies when `PRESERVE_CATALOG=false`. |
| `PRESERVE_CATALOG` | no | `true` | When `true`, the scanner never removes documents from the index automatically. Use the **Admin** page in the UI for intentional manual cleanup. Strongly recommended when the corpus is on a NAS. |

### OCR workers

| Variable | Required | Default | Description |
|---|---|---|---|
| `OCR_WORKER_COUNT` | no | `4` | Number of parallel OCR worker replicas |
| `OCR_ENGINE` | no | `tesseract` | OCR backend (currently only `tesseract`) |

---

## Search syntax

The search bar accepts PostgreSQL `websearch_to_tsquery` syntax plus automatic fallbacks:

| What you type | How it matches |
|---|---|
| `renan` | Full-text + prefix (`renan*`) + trigram substring |
| `renen` | Fuzzy match (typo tolerance via `word_similarity`) — single word, ≥ 4 chars |
| `main.tf` | Trigram substring — finds terms embedded in technical strings |
| `201790130509` | Digit-normalised — strips separators, matches the raw digit sequence anywhere in the text |
| `314 493 050` | Same digit-normalised path — spaces/dashes between digits are ignored |
| `"annual report"` | Exact phrase (FTS phrase operator) |
| `cloud AND storage` | Boolean AND |
| `invoice -draft` | Exclude term |

Results are ranked: exact FTS > prefix > trigram > digits > fuzzy.

---

## OCR pipeline

Files are processed in this order:

1. **pdftotext** — fast text extraction for electronically-generated PDFs
2. **OCRmyPDF** (`skip_text=True`) — adds an OCR layer to scanned PDFs without a text layer
3. **Garbled-font detection** — if > 70% of extracted characters are the same letter (obfuscated custom font encoding), falls back to:
4. **Force OCR** (`force_ocr=True`) — re-renders every page and runs Tesseract
5. **Render fallback** — if the PDF is digitally signed (OCRmyPDF refuses `force_ocr` on signed PDFs), uses `pdftoppm` to render pages as images and runs Tesseract directly

Tesseract is configured with **English + Portuguese + German** language packs. Add more by editing `worker/Dockerfile`.

**Supported file types:** PDF, PNG, JPG/JPEG, TIFF, BMP, GIF, WEBP, DOCX, XLSX, XLS, ODS, TXT, CSV, TSV, MD

---

## Text corrections

Every indexed document has a **Text** button that opens a dedicated editor page. You can:

- View the full OCR output page by page
- Edit any page's text — corrections are saved to Postgres and update search immediately
- Toggle between corrected and original text
- Revert a page back to the original OCR output at any time

The original OCR text is always preserved in `extractions.original_text` and is never overwritten.

---

## Reverse proxy (Nginx example)

The stack does not include TLS. A minimal Nginx config for a site behind HTTPS:

```nginx
server {
    listen 443 ssl;
    server_name scriptorium.example.com;

    ssl_certificate     /etc/ssl/certs/scriptorium.crt;
    ssl_certificate_key /etc/ssl/private/scriptorium.key;

    location / {
        proxy_pass         http://<vm-ip>:8000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_read_timeout 120s;
        client_max_body_size 0;
    }
}
```

---

## Updating

```bash
git pull
docker compose build web
docker compose up -d web
```

Only the `web` image needs a rebuild for frontend or API changes. Rebuild `ocr-worker` if you change the OCR pipeline or add Tesseract language packs.

---

## Data persistence

| What | Where |
|---|---|
| Document catalog + extracted text | `postgres_data` Docker volume |
| Redis job queue | `redis_data` Docker volume |
| Original files | Your corpus directory — never touched by Scriptorium |

---

## NFS safety and MISS_THRESHOLD

The scanner has two layers of protection against accidental mass-purge when your NAS goes offline:

1. **Hard mount failure** (stale handle, connection refused, etc.) — `os.scandir()` throws an `OSError`. The scanner logs the error and skips the entire scan, including deletion reconciliation. `miss_count` is never incremented. Your library survives indefinitely.

2. **Silent mount failure** (soft NFS mount that returns an empty directory instead of an error) — the scanner detects that the walk returned zero files while the DB still has documents and skips deletion reconciliation with a warning. This is the dangerous edge case that `MISS_THRESHOLD` alone cannot protect against.

The default `MISS_THRESHOLD=2` is designed for genuinely deleted files, not NFS outages. If you want extra headroom for the case where a handful of files go missing for a legitimate reason (e.g. NFS partially mounted), raise it:

```bash
# .env — 288 scans × 300s = 24 hours before any file is purged
MISS_THRESHOLD=288
```

For best reliability, mount your NFS share with `hard` and `timeo`/`retrans` options so the kernel blocks rather than returning stale data silently.

---

## Design constraints

These are intentional, not limitations:

- **No inotify** — the scanner uses `os.walk` + `stat` polling. inotify is invisible to NFS clients and would silently miss remote changes.
- **No in-stack reverse proxy** — TLS is handled by an external Nginx on a different machine.
- **No object storage** — files are served directly from the read-only NFS mount.
- **No semantic/vector search in v1** — `pgvector` is installed but unused; planned for a future phase.
- **Corpus is read-only** — Scriptorium has zero write access to your original files, by design.
