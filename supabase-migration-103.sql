-- Migration 103: Visual document analysis — library_document_pages + chunk provenance columns
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Foundation for the Research Library's deep-intelligence follow-up
-- (schema_version 2 of library_document_analysis.content — see
-- lib/library-documents/analysis-schema.ts's header comment): the first
-- real document tested through Phase 1 showed that extracted text alone
-- under-serves a real report — charts, pull-quotes and callout stats
-- rendered as design elements are structurally invisible to a text-only
-- pipeline, and PDF technical page numbers don't match a report's own
-- printed folios (a report can be 11 PDF pages but many two-page spreads,
-- printed "4-5", "6-7", etc).
--
-- The architectural decision (see the deep-intelligence plan): visual
-- evidence becomes MORE ROWS in the table that already exists
-- (library_document_chunks), not a parallel findings system — a rendered
-- page's AI-described visual content is written back as an ordinary chunk
-- row, tagged evidence_kind='visual', so every downstream consumer
-- (the analysis prompt, the citation validator, the provenance display)
-- needs zero new concepts to reconcile text and visual evidence together.
--
-- Two changes:
--
-- 1. library_document_pages — new table, one row per rendered PDF page.
--    pdf_page_number is the technical, always-reliable index; printed_page_label
--    is a best-effort human-readable folio ("4–5", "12") detected by the
--    same vision pass that describes the page's visual content — null when
--    not legible, which is expected and fine, not an error state. The
--    rendered image itself lives in the existing private library-documents
--    Storage bucket (migration 100) — no new bucket.
--
-- 2. library_document_chunks — two new columns. evidence_kind distinguishes
--    a chunk built from extracted text (the only kind that has existed
--    until now) from one built from a page's visual description.
--    printed_page_label is backfilled here too (from the matching
--    library_document_pages row) so a TEXT chunk citing page 4 displays
--    the same human folio a VISUAL chunk on that page would — provenance
--    display never needs to know which kind of chunk it's reading.
--
-- Note: the column is named evidence_kind, not source_kind — this schema
-- already uses "source_*" for research_summaries/research_project_evidence's
-- polymorphic (source_type, source_id) evidence-attachment concept
-- (see supabase-migration-069.sql); naming this "source_kind" would read as
-- related to that and isn't — it's purely "how was this chunk's text
-- produced," a document-internal distinction.

-- ── 1. library_document_pages ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS library_document_pages (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  library_document_id  uuid        NOT NULL REFERENCES library_documents(id) ON DELETE CASCADE,

  pdf_page_number       integer     NOT NULL,
  -- Best-effort, vision-detected human folio — a display string, not a
  -- parsed/structured range (a printed page can read "iv", "4-5", "12",
  -- or anything a real report design uses). Null when not legible.
  printed_page_label    text,

  image_storage_path    text        NOT NULL,
  image_width            integer,
  image_height            integer,

  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_library_document_pages_unique
  ON library_document_pages (library_document_id, pdf_page_number);

ALTER TABLE library_document_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_library_document_pages" ON library_document_pages USING (false);

-- ── 2. library_document_chunks — evidence_kind + printed_page_label ─────

ALTER TABLE library_document_chunks
  ADD COLUMN IF NOT EXISTS evidence_kind text NOT NULL DEFAULT 'text' CHECK (evidence_kind IN ('text', 'visual')),
  ADD COLUMN IF NOT EXISTS printed_page_label text;

CREATE INDEX IF NOT EXISTS idx_library_document_chunks_evidence_kind ON library_document_chunks (evidence_kind);

-- Rollback:
--   ALTER TABLE library_document_chunks DROP COLUMN IF EXISTS evidence_kind, DROP COLUMN IF EXISTS printed_page_label;
--   DROP TABLE IF EXISTS library_document_pages;
