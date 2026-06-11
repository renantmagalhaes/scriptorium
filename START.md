# Getting started

## Prerequisites

- Docker Engine 24+ and Docker Compose v2 (`docker compose` — note: no hyphen)
- Your NFS share already mounted on the host (e.g. `/mnt/nas/documents`)

---

## 1. Configure the environment

```bash
cp env.example .env
```

Open `.env` and fill in every value. The ones that **must** be changed before first start:

| Variable | What to set |
|---|---|
| `POSTGRES_PASSWORD` | Any strong password |
| `REDIS_PASSWORD` | Any strong password |
| `UI_USERNAME` | Your login username for the web UI |
| `UI_PASSWORD` | Your login password for the web UI |
| `SECRET_KEY` | Random 64-char hex string (see below) |
| `CORPUS_PATH` | Absolute path to your NFS mount on this host |
| `WEB_PORT` | Host port to expose (default `8000`) |

Generate `SECRET_KEY`:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

---

## 2. Build and start

```bash
docker compose up -d --build
```

First build takes a few minutes (downloads base images, installs Tesseract, builds the React app). Subsequent starts are fast.

Check everything came up:
```bash
docker compose ps
```

All five services (`postgres`, `redis`, `web`, `scanner`, `ocr-worker`) should show `running` or `healthy`.

---

## 3. Access the UI

The web service is exposed on `WEB_PORT` (default `8000`) on all interfaces. Open it directly:

```
http://<vm-ip>:8000
```

Log in with the `UI_USERNAME` / `UI_PASSWORD` you set in `.env`.

**To put it behind your Nginx** (on the other machine), just proxy to `http://<vm-ip>:8000` — no special Docker networking needed.

---

## 4. What happens on first start

1. Postgres initialises the schema on first boot.
2. The **scanner** walks your entire corpus. Depending on size this first pass can take minutes to hours — it's just `stat` calls, so it's I/O light.
3. Every file found is inserted as `pending` and pushed onto the OCR queue.
4. The **4 OCR workers** (default) start draining the queue. Each PDF or image takes a few seconds to a minute. Plain text files, CSVs, and spreadsheets are near-instant.
5. Once a document reaches `status = done` it appears in search results immediately.

Watch the queue drain in real time:
```bash
# Live worker logs
docker compose logs -f ocr-worker

# Queue depth (how many jobs still waiting)
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" llen ocr_queue

# DB counts per status
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "SELECT status, count(*) FROM documents GROUP BY status ORDER BY status;"
```

---

## 5. Useful day-to-day commands

```bash
# Tail all logs
docker compose logs -f

# Tail a specific service
docker compose logs -f scanner
docker compose logs -f web

# Restart a single service
docker compose restart scanner

# Scale OCR workers up/down temporarily
docker compose up -d --scale ocr-worker=8

# Stop everything (data volumes preserved)
docker compose down

# Stop + wipe all data (destructive — requires re-indexing)
docker compose down -v
```

---

## 6. Re-indexing a specific file

If a file came back as `error` and you've fixed whatever caused it, reset it to `pending`:
```bash
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "UPDATE documents SET status='pending', error_detail=NULL WHERE path='relative/path/to/file.pdf';"
```

The next scanner pass will re-enqueue it automatically (or restart the scanner to trigger one immediately).

---

## 7. Backups

Postgres holds everything — the file catalog, all extracted text, and the search indexes. Back it up regularly:

```bash
docker compose exec postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "scriptorium_$(date +%Y%m%d_%H%M%S).sql.gz"
```

Your original files on the NAS are never touched by this application, so they only need the NAS's own backup strategy.
