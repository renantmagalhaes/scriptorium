"""
Scriptorium OCR worker.

Consumes jobs from the Redis list 'ocr_queue' (BRPOP, blocking).
For each job:
  1. Mark document as processing.
  2. Run OCR via ocr.engine.extract_text.
  3. Replace any prior extractions with the new text.
  4. Mark document as done (or error on failure).

Crash-safe: if the worker dies mid-job the row stays as 'processing'.
The scanner will re-enqueue it on the next pass when it detects the file
is still present but the status hasn't advanced (the scanner sets status
back to 'pending' if content_hash changes; stale 'processing' rows are
naturally retried on restart via the MISS_THRESHOLD guard being skipped
for files that are still present).

NOTE: this worker never writes to CORPUS_ROOT.  The corpus mount is
read-only.  All OCR temp files go to /tmp (tmpfs in the container).
"""

import json
import logging
import os
import time
from pathlib import Path

import psycopg2
import psycopg2.extras
import redis

from ocr.engine import OCRError, extract_text

# ─── Configuration ────────────────────────────────────────────────────────────
CORPUS_ROOT = Path(os.environ["CORPUS_ROOT"]).resolve()
DB_URL      = os.environ["DATABASE_URL"]
REDIS_URL   = os.environ["REDIS_URL"]
OCR_ENGINE  = os.environ.get("OCR_ENGINE", "tesseract")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [worker] %(levelname)s %(message)s",
)
log = logging.getLogger("worker")


# ─── Job processing ───────────────────────────────────────────────────────────

def _process(db, job: dict) -> None:
    doc_id   = job["document_id"]
    rel_path = job["path"]
    file_path = CORPUS_ROOT / rel_path

    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("SELECT id, status FROM documents WHERE id = %s", (doc_id,))
    doc = cur.fetchone()
    if doc is None:
        log.warning("doc_id=%d not found (already purged?), skipping", doc_id)
        return

    # ── Mark as processing ────────────────────────────────────────────────────
    cur.execute(
        "UPDATE documents SET status='processing', updated_at=NOW() WHERE id=%s",
        (doc_id,),
    )
    db.commit()

    # ── Run OCR ───────────────────────────────────────────────────────────────
    try:
        pages = extract_text(file_path, engine=OCR_ENGINE)
    except OCRError as e:
        log.error("OCR error doc_id=%d path=%s: %s", doc_id, rel_path, e)
        cur.execute(
            """
            UPDATE documents
            SET status='error', error_detail=%s, updated_at=NOW()
            WHERE id=%s
            """,
            (str(e)[:2000], doc_id),
        )
        db.commit()
        return

    # ── Persist extractions ───────────────────────────────────────────────────
    cur.execute("DELETE FROM extractions WHERE document_id = %s", (doc_id,))

    inserted = 0
    for page_num, text in pages:
        if text.strip():
            cur.execute(
                "INSERT INTO extractions (document_id, page, text, created_at) VALUES (%s,%s,%s,NOW())",
                (doc_id, page_num, text),
            )
            inserted += 1

    cur.execute(
        """
        UPDATE documents
        SET status='done', ocr_completed_at=NOW(), error_detail=NULL, updated_at=NOW()
        WHERE id=%s
        """,
        (doc_id,),
    )
    db.commit()
    log.info("Done doc_id=%d path=%s pages=%d extractions=%d",
             doc_id, rel_path, len(pages), inserted)


# ─── Main loop ────────────────────────────────────────────────────────────────

def main() -> None:
    log.info("OCR worker starting — engine=%s corpus=%s", OCR_ENGINE, CORPUS_ROOT)

    while True:
        try:
            db  = psycopg2.connect(DB_URL)
            rdb = redis.from_url(REDIS_URL, decode_responses=True)
            log.info("Connected to DB and Redis")

            while True:
                try:
                    # Block up to 5 s waiting for a job; loops on empty queue.
                    item = rdb.brpop("ocr_queue", timeout=5)
                    if item is None:
                        continue
                    _, payload = item
                    job = json.loads(payload)
                    log.info("Job received: doc_id=%d path=%s",
                             job["document_id"], job["path"])
                    _process(db, job)

                except psycopg2.OperationalError as e:
                    log.error("DB connection lost: %s — reconnecting", e)
                    break
                except Exception:
                    log.exception("Unexpected error processing job")
                    time.sleep(1)

            try:
                db.close()
                rdb.close()
            except Exception:
                pass

        except Exception:
            log.exception("Failed to connect — retrying in 5s")
            time.sleep(5)


if __name__ == "__main__":
    main()
