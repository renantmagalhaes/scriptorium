-- Scriptorium — PostgreSQL schema
-- Runs once on first container start (docker-entrypoint-initdb.d).

-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- pgvector reserved for Phase 2 (semantic search); unused in v1.
-- CREATE EXTENSION IF NOT EXISTS vector;

-- ─── documents (the catalog) ──────────────────────────────────────────────────
-- Every file the scanner has ever seen. This is the source of truth for
-- what has been indexed and what still needs OCR.
CREATE TABLE IF NOT EXISTS documents (
    id               BIGSERIAL PRIMARY KEY,
    path             TEXT        UNIQUE NOT NULL,        -- relative to CORPUS_ROOT
    size_bytes       BIGINT      NOT NULL DEFAULT 0,
    mtime            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    content_hash     TEXT,                               -- SHA-256; NULL until first hash
    status           TEXT        NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','processing','done','error')),
    error_detail     TEXT,
    miss_count       INTEGER     NOT NULL DEFAULT 0,     -- consecutive scan misses
    last_seen        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ocr_completed_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_path   ON documents (path);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents (status);

-- path_tsv: tokenise the file path for filename search.
-- Uses 'simple' (lowercase only, no stemming) so "CV_AI_Eng.pdf" matches
-- a query for "CV AI".  Separators (/ _ . -) are replaced with spaces.
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS path_tsv TSVECTOR
        GENERATED ALWAYS AS (
            to_tsvector('simple', regexp_replace(path, '[/_.\-]', ' ', 'g'))
        ) STORED;

CREATE INDEX IF NOT EXISTS idx_documents_path_tsv ON documents USING GIN (path_tsv);

-- ─── extractions (searchable text) ───────────────────────────────────────────
-- One row per page (or one row for single-page formats).
-- ON DELETE CASCADE keeps the DB consistent when a file disappears externally
-- and the scanner removes the documents row.
CREATE TABLE IF NOT EXISTS extractions (
    id          BIGSERIAL PRIMARY KEY,
    document_id BIGINT      NOT NULL
                    REFERENCES documents (id) ON DELETE CASCADE,
    page        INTEGER,                                  -- NULL for single-page formats
    text          TEXT        NOT NULL,
    original_text TEXT,                                   -- set on first manual correction; NULL = never edited
    -- Generated tsvector; maintained automatically by Postgres.
    tsv           TSVECTOR    GENERATED ALWAYS AS (to_tsvector('english', text)) STORED,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- GIN index for full-text search via tsvector
CREATE INDEX IF NOT EXISTS idx_extractions_tsv      ON extractions USING GIN (tsv);
-- GIN trigram index for fuzzy/substring matching
CREATE INDEX IF NOT EXISTS idx_extractions_trgm     ON extractions USING GIN (text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_extractions_doc      ON extractions (document_id);

-- ─── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_documents_updated_at ON documents;
CREATE TRIGGER trg_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION _set_updated_at();
