import html as html_module
import re
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from ..auth import get_current_user
from ..database import get_db
from ..schemas import SearchResponse, SearchResult

router = APIRouter(prefix="/api/search", tags=["search"])

# Matches the literal <mark> / </mark> tags that ts_headline emits.
_MARK_RE = re.compile(r"(</?mark>)")


def _safe_snippet(raw: str) -> str:
    """HTML-escape raw text except for the literal <mark></mark> tags that
    ts_headline emits.  Prevents XSS from OCR'd or user-supplied content."""
    parts = _MARK_RE.split(raw)
    return "".join(
        p if p in ("<mark>", "</mark>") else html_module.escape(p)
        for p in parts
    )


def _trgm_snippet(raw: str, term: str) -> str:
    """Like _safe_snippet but adds <mark> tags around every occurrence of
    *term* in the plain-text excerpt (used for trigram-only matches where
    ts_headline has no tsquery to highlight against)."""
    marked = re.sub(f"({re.escape(term)})", r"<mark>\1</mark>", raw, flags=re.IGNORECASE)
    parts = _MARK_RE.split(marked)
    return "".join(
        p if p in ("<mark>", "</mark>") else html_module.escape(p)
        for p in parts
    )


@router.get("", response_model=SearchResponse)
async def search(
    q: str = Query(..., min_length=1, max_length=500),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    _: Annotated[str, Depends(get_current_user)] = None,
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    offset = (page - 1) * limit

    # Fuzzy (word-similarity) path: enabled only for single-word queries ≥ 4 chars.
    # word_similarity('renen', text) ≥ 0.25 catches 1-char substitutions in 5-char words
    # without flooding results for short or multi-word searches.
    _q_words = q.split()
    _do_fuzzy = (
        len(_q_words) == 1
        and len(_q_words[0]) >= 4
        and not _q_words[0].isdigit()  # digit-only queries use the digits path instead
    )
    _fuzzy_where = "OR word_similarity(:q, e.text) >= 0.25" if _do_fuzzy else ""
    _fuzzy_rank  = (
        ", CASE WHEN word_similarity(:q, e.text) >= 0.25"
        " THEN word_similarity(:q, e.text) * 0.2 ELSE 0 END"
        if _do_fuzzy else ""
    )

    # Digits path: for purely-numeric queries (digits + common separators only),
    # strip all non-digit chars from both query and text before matching.
    # pdftotext -layout can insert spaces inside numbers when PDFs use
    # character-level positioning (e.g. "2 0 1 7 9 0 1 3 0 5 0 9").
    # This also handles number groups: "314 493 050" → search "314493050".
    _q_digits = re.sub(r'[^\d]', '', q)
    _do_digits = bool(re.fullmatch(r'[\d\s\-\.\/]+', q.strip())) and len(_q_digits) >= 4
    _digits_where = (
        "OR regexp_replace(e.text, '[^0-9]', '', 'g') LIKE '%' || :q_digits || '%'"
        if _do_digits else ""
    )
    _digits_rank = (
        ", CASE WHEN regexp_replace(e.text, '[^0-9]', '', 'g') LIKE '%' || :q_digits || '%'"
        " THEN 0.25 ELSE 0 END"
        if _do_digits else ""
    )
    _digits_match_when = (
        "WHEN regexp_replace(e.text, '[^0-9]', '', 'g') LIKE '%' || :q_digits || '%' THEN 'digits'"
        if _do_digits else ""
    )
    # ELSE in match_type CASE: fuzzy if that path is active, otherwise fallthrough label
    _else_match = "'fuzzy'" if _do_fuzzy else "'trgm'"

    # Two tsquery forms built once as CTEs and reused everywhere:
    #   eng_q  — websearch syntax with English stemming (full words, phrases,
    #            AND/OR/negation); "who" is a stopword here → NULL, no crash
    #   pfx_q  — simple dictionary + :* suffix per token; "who" → who:* matches
    #            "whoami", "cert" → cert:* matches "certidao"; used for both
    #            content and filename prefix matching
    # Both are NULL-safe: @@ NULL evaluates to NULL (falsy), not an error.
    _QUERY_CTES = """
        eng_q AS (
            SELECT websearch_to_tsquery('english', :q) AS tsq
        ),
        pfx_q AS (
            SELECT to_tsquery('simple', string_agg(lexeme || ':*', ' & ')) AS tsq
            FROM   (SELECT lexeme FROM unnest(to_tsvector('simple', :q))) _lex
        )
    """

    count_sql = text(f"""
        WITH {_QUERY_CTES}
        SELECT COUNT(DISTINCT d.id)
        FROM   documents d
        WHERE  d.status = 'done'
          AND (
               EXISTS (
                   SELECT 1 FROM extractions e
                   WHERE  e.document_id = d.id
                     AND (
                          e.tsv @@ (SELECT tsq FROM eng_q)
                       OR e.tsv @@ (SELECT tsq FROM pfx_q)
                       OR e.text ILIKE '%' || :q || '%'
                       {_fuzzy_where}
                       {_digits_where}
                     )
               )
            OR d.path_tsv @@ (SELECT tsq FROM pfx_q)
          )
    """)

    # best_extraction: pick the highest-ranking extraction per document.
    # Three match paths, in priority order:
    #   1. eng_q  — English-stemmed FTS; ts_headline highlights stems
    #   2. pfx_q  — simple prefix FTS; ts_headline highlights prefix matches
    #   3. trgm   — ILIKE substring via pg_trgm GIN index; snippet extracted in
    #               SQL, highlighted with plain regex in Python (_trgm_snippet)
    # match_type is returned so Python knows which highlighting path to take.
    search_sql = text(f"""
        WITH {_QUERY_CTES},
        best_extraction AS (
            SELECT DISTINCT ON (e.document_id)
                   e.document_id,
                   CASE
                       WHEN e.tsv @@ (SELECT tsq FROM eng_q) THEN 'fts'
                       WHEN e.tsv @@ (SELECT tsq FROM pfx_q) THEN 'pfx'
                       WHEN e.text ILIKE '%' || :q || '%'    THEN 'trgm'
                       {_digits_match_when}
                       ELSE {_else_match}
                   END                                                       AS match_type,
                   CASE
                       WHEN e.tsv @@ (SELECT tsq FROM eng_q)
                       THEN ts_headline('english', e.text, (SELECT tsq FROM eng_q),
                                'MaxFragments=2,MaxWords=50,MinWords=10,StartSel=<mark>,StopSel=</mark>')
                       WHEN e.tsv @@ (SELECT tsq FROM pfx_q)
                       THEN ts_headline('simple',  e.text, (SELECT tsq FROM pfx_q),
                                'MaxFragments=2,MaxWords=50,MinWords=10,StartSel=<mark>,StopSel=</mark>')
                       ELSE
                           -- trgm: positioned excerpt with marks added by Python.
                           -- fuzzy: position() returns 0 (term not literally present),
                           --        so substring starts at 1 giving first 400 chars as context.
                           substring(e.text
                               from  GREATEST(1, position(lower(:q) in lower(e.text)) - 120)
                               for   400)
                   END                                                       AS snippet,
                   GREATEST(
                       COALESCE(ts_rank_cd(e.tsv, (SELECT tsq FROM eng_q)), 0),
                       COALESCE(ts_rank_cd(e.tsv, (SELECT tsq FROM pfx_q)), 0) * 0.8,
                       CASE WHEN e.text ILIKE '%' || :q || '%' THEN 0.3 ELSE 0 END
                       {_fuzzy_rank}
                       {_digits_rank}
                   )                                                         AS rank
            FROM   extractions e
            WHERE  e.tsv @@ (SELECT tsq FROM eng_q)
                OR e.tsv @@ (SELECT tsq FROM pfx_q)
                OR e.text ILIKE '%' || :q || '%'
                {_fuzzy_where}
                {_digits_where}
            ORDER  BY e.document_id, rank DESC
        )
        SELECT d.id                                            AS doc_id,
               d.path,
               d.status,
               d.ocr_completed_at,
               d.updated_at,
               COALESCE(be.snippet, d.path)                   AS snippet,
               COALESCE(be.match_type, 'path')                AS match_type,
               GREATEST(
                   COALESCE(be.rank, 0),
                   CASE WHEN d.path_tsv @@ (SELECT tsq FROM pfx_q) THEN 0.7 ELSE 0 END
               )                                              AS rank
        FROM   documents d
        LEFT JOIN best_extraction be ON be.document_id = d.id
        WHERE  d.status = 'done'
          AND (
               be.document_id IS NOT NULL
            OR d.path_tsv @@ (SELECT tsq FROM pfx_q)
          )
        ORDER  BY rank DESC
        LIMIT  :limit OFFSET :offset
    """)

    _base = {"q": q}
    if _do_digits:
        _base["q_digits"] = _q_digits

    total = (await db.execute(count_sql, _base)).scalar_one_or_none() or 0
    rows  = (await db.execute(search_sql, {**_base, "limit": limit, "offset": offset})).mappings()

    results = []
    for row in rows:
        raw = row["snippet"] or ""
        match_type = row["match_type"] or "path"
        # trgm and path: exact substring present → highlight it; everything else: plain escape
        snippet = _trgm_snippet(raw, q) if match_type in ("trgm", "path") else _safe_snippet(raw)
        results.append(SearchResult(
            doc_id=row["doc_id"],
            path=row["path"],
            status=row["status"],
            ocr_completed_at=row["ocr_completed_at"],
            updated_at=row["updated_at"],
            snippet=snippet,
            rank=float(row["rank"]),
        ))

    return SearchResponse(results=results, total=total, query=q, page=page, limit=limit)
