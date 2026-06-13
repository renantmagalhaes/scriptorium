"""
Scriptorium scanner — periodic corpus walker.

Responsibilities:
  1. Walk CORPUS_ROOT (read-only NFS mount) using os.walk / stat — no inotify.
  2. Diff against the documents catalog in Postgres.
  3. Enqueue OCR jobs in Redis for new/changed files.
  4. Increment miss_count for absent files; purge DB rows only after
     MISS_THRESHOLD consecutive misses (guards against transient NFS outages).

Design notes
  • inotify is intentionally NOT used. NFS changes made by remote clients
    are invisible to the local kernel's VFS event layer.
  • stat is used as a cheap pre-filter before the more-expensive SHA-256 hash.
  • If the corpus root is unreadable the entire scan (including deletion
    reconciliation) is skipped so a mount failure never triggers mass-purge.
  • Symlinks to files are checked for containment inside CORPUS_ROOT; symlinks
    that escape the root are silently skipped.
  • Original files are NEVER written, moved, renamed, or deleted — this service
    issues zero write/delete syscalls against the corpus, ever.
"""

import hashlib
import json
import logging
import os
import stat as stat_mod
import time
from pathlib import Path

import psycopg2
import psycopg2.extras
import redis

# ─── Configuration ────────────────────────────────────────────────────────────
CORPUS_ROOT    = Path(os.environ["CORPUS_ROOT"]).resolve()
DB_URL         = os.environ["DATABASE_URL"]
REDIS_URL      = os.environ["REDIS_URL"]
SCAN_INTERVAL    = int(os.environ.get("SCAN_INTERVAL",  "300"))
MISS_THRESHOLD   = int(os.environ.get("MISS_THRESHOLD", "2"))
# When true (default), the scanner never removes documents from the catalog
# even if the corresponding file disappears from the corpus.
# Use the Admin page in the UI for intentional manual cleanup.
PRESERVE_CATALOG = os.environ.get("PRESERVE_CATALOG", "true").lower() not in ("0", "false", "no", "off")

try:
    from ocr.engine import ALL_EXTENSIONS as SUPPORTED_EXTENSIONS
except ImportError:
    SUPPORTED_EXTENSIONS = frozenset({
        # PDFs
        ".pdf",
        # Images (OCR)
        ".png", ".jpg", ".jpeg", ".tiff", ".tif", ".bmp", ".gif", ".webp",
        # Plain text (read directly)
        ".txt", ".md", ".rst", ".log", ".csv", ".tsv", ".nfo",
        # Spreadsheets
        ".xlsx", ".xls", ".ods",
        # Word documents
        ".docx",
    })


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [scanner] %(levelname)s %(message)s",
)
log = logging.getLogger("scanner")

# ─── Helpers ──────────────────────────────────────────────────────────────────

def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65_536), b""):
            h.update(chunk)
    return h.hexdigest()


def _mount_healthy() -> bool:
    """
    Returns False if CORPUS_ROOT itself is unreadable (NFS offline, stale
    handle, permission error, etc.).  An empty-but-accessible directory is
    healthy.
    """
    try:
        next(iter(os.scandir(CORPUS_ROOT)), None)
        return True
    except OSError as e:
        log.error("Corpus root unreadable: %s", e)
        return False


def _walk_corpus():
    """
    Yield (relative_path_str, os.stat_result) for every supported, non-symlink
    file under CORPUS_ROOT.

    Symlinks to files are resolved and checked for containment; those that
    escape CORPUS_ROOT are skipped with a warning.  os.walk is called with
    followlinks=False so symlinks to *directories* are never descended into.
    """
    corpus_prefix = str(CORPUS_ROOT) + os.sep

    for dirpath, _dirnames, filenames in os.walk(str(CORPUS_ROOT), followlinks=False):
        for filename in filenames:
            full = Path(dirpath) / filename

            if full.suffix.lower() not in SUPPORTED_EXTENSIONS:
                continue

            try:
                lst = full.lstat()
            except OSError:
                continue

            if stat_mod.S_ISLNK(lst.st_mode):
                try:
                    resolved = full.resolve()
                    if not str(resolved).startswith(corpus_prefix):
                        log.warning("Skipping symlink that escapes corpus: %s → %s", full, resolved)
                        continue
                    st = resolved.stat()
                except OSError:
                    continue
            else:
                st = lst

            rel = str(full.relative_to(CORPUS_ROOT))
            yield rel, st


def _enqueue(rdb: redis.Redis, doc_id: int, path: str) -> None:
    rdb.lpush("ocr_queue", json.dumps({"document_id": doc_id, "path": path}))


# ─── Main scan logic ──────────────────────────────────────────────────────────

def _run_scan(db, rdb: redis.Redis) -> None:
    log.info("Scan started (interval=%ds, miss_threshold=%d)", SCAN_INTERVAL, MISS_THRESHOLD)

    if not _mount_healthy():
        log.error("Skipping scan — corpus root is unreadable")
        return

    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    seen: set[str] = set()
    new_count = changed_count = skipped_count = 0

    # Jobs are collected here and enqueued AFTER db.commit() so workers
    # never receive a job whose row isn't visible yet (enqueue-before-commit
    # race condition).
    pending_jobs: list[tuple[int, str]] = []

    # ── Walk pass ─────────────────────────────────────────────────────────────
    for rel_path, st in _walk_corpus():
        seen.add(rel_path)
        size  = st.st_size
        mtime = st.st_mtime  # epoch float

        cur.execute(
            "SELECT id, size_bytes, mtime, content_hash FROM documents WHERE path = %s",
            (rel_path,),
        )
        row = cur.fetchone()

        if row is None:
            # New file — insert as pending; job queued after commit below.
            cur.execute(
                """
                INSERT INTO documents
                    (path, size_bytes, mtime, status, last_seen, created_at, updated_at)
                VALUES (%s, %s, to_timestamp(%s), 'pending', NOW(), NOW(), NOW())
                RETURNING id
                """,
                (rel_path, size, mtime),
            )
            doc_id = cur.fetchone()["id"]
            pending_jobs.append((doc_id, rel_path))
            new_count += 1

        else:
            doc_id = row["id"]
            # Reset miss_count and refresh last_seen for every observed file.
            cur.execute(
                "UPDATE documents SET last_seen = NOW(), miss_count = 0 WHERE id = %s",
                (doc_id,),
            )

            # Cheap stat pre-filter: skip hashing if nothing has changed.
            old_mtime = row["mtime"].timestamp() if row["mtime"] else 0.0
            if size == row["size_bytes"] and abs(mtime - old_mtime) < 1.0:
                skipped_count += 1
                continue

            # Stat changed — verify with content hash.
            try:
                new_hash = _sha256(CORPUS_ROOT / rel_path)
            except OSError as e:
                log.warning("Cannot hash %s: %s", rel_path, e)
                continue

            if new_hash == row["content_hash"]:
                # Only mtime/size fluctuation; content identical.
                cur.execute(
                    "UPDATE documents SET size_bytes=%s, mtime=to_timestamp(%s), updated_at=NOW() WHERE id=%s",
                    (size, mtime, doc_id),
                )
                skipped_count += 1
            else:
                # Genuine content change — re-enqueue after commit.
                cur.execute(
                    """
                    UPDATE documents
                    SET size_bytes   = %s,
                        mtime        = to_timestamp(%s),
                        content_hash = %s,
                        status       = 'pending',
                        error_detail = NULL,
                        updated_at   = NOW()
                    WHERE id = %s
                    """,
                    (size, mtime, new_hash, doc_id),
                )
                pending_jobs.append((doc_id, rel_path))
                changed_count += 1

    # Commit first so rows are visible, then enqueue.
    db.commit()
    for doc_id, rel_path in pending_jobs:
        _enqueue(rdb, doc_id, rel_path)

    log.info("Walk complete — new: %d, changed: %d, skipped: %d",
             new_count, changed_count, skipped_count)

    # ── Deletion reconciliation ───────────────────────────────────────────────
    if PRESERVE_CATALOG:
        log.info("PRESERVE_CATALOG=true — deletion reconciliation skipped")
        return

    # Only runs when the mount was confirmed healthy at the start of the scan.
    # We bump miss_count for absent files and purge only at threshold.
    # This means a transient NFS dropout adds at most 1 to every counter
    # rather than wiping the entire index.
    #
    # Safety guard: if the walk returned zero files but the DB has documents,
    # the mount is almost certainly unhealthy even though _mount_healthy()
    # passed (e.g. soft NFS mount returning an empty directory on failure).
    # Skip reconciliation entirely to avoid mass-purge.
    cur.execute("SELECT COUNT(*) AS n FROM documents")
    db_count = cur.fetchone()["n"]
    if len(seen) == 0 and db_count > 0:
        log.warning(
            "Walk returned 0 files but DB has %d documents — "
            "possible silent mount failure, skipping deletion reconciliation.",
            db_count,
        )
        db.commit()
        return

    cur.execute("SELECT id, path, miss_count FROM documents")
    all_docs = cur.fetchall()
    purged = bumped = 0

    for doc in all_docs:
        if doc["path"] in seen:
            continue  # still present, already handled above

        new_miss = doc["miss_count"] + 1
        if new_miss >= MISS_THRESHOLD:
            cur.execute("DELETE FROM documents WHERE id = %s", (doc["id"],))
            log.info("Purged (absent %d/%d passes): %s", new_miss, MISS_THRESHOLD, doc["path"])
            purged += 1
        else:
            cur.execute(
                "UPDATE documents SET miss_count = %s, updated_at = NOW() WHERE id = %s",
                (new_miss, doc["id"]),
            )
            bumped += 1

    db.commit()
    log.info("Deletion reconciliation — purged: %d, miss_count bumped: %d", purged, bumped)


# ─── Entry point ──────────────────────────────────────────────────────────────

def main() -> None:
    log.info("Corpus root      : %s", CORPUS_ROOT)
    log.info("Scan interval    : %ds", SCAN_INTERVAL)
    log.info("Miss threshold   : %d", MISS_THRESHOLD)
    log.info("Preserve catalog : %s", PRESERVE_CATALOG)

    rdb = redis.from_url(REDIS_URL, decode_responses=True)

    while True:
        db = psycopg2.connect(DB_URL)
        try:
            _run_scan(db, rdb)
        except Exception:
            log.exception("Scan error")
        finally:
            db.close()

        # Drain any extra triggers queued while the scan was running
        # (e.g. button clicked multiple times) so they don't cause an
        # immediate re-scan before the next natural interval.
        while rdb.lpop("scan_trigger"):
            pass

        log.info("Waiting up to %ds (trigger: redis scan_trigger) …", SCAN_INTERVAL)
        # blpop blocks until a trigger arrives OR the timeout elapses —
        # either way we fall through and run the next scan.
        rdb.blpop("scan_trigger", timeout=SCAN_INTERVAL)


if __name__ == "__main__":
    main()
