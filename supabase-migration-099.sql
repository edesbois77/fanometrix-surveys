-- Migration 099: Research Library foundation — library_documents + library_document_chunks
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- First tables for the Research Library — reusable Uploaded Documents that
-- exist independently of any Research Project, searchable and attachable to
-- any number of them (see the Research Sources expansion plan: Uploaded
-- Documents / Research Library architecture, decided as Option B — global
-- document analysis gets its own table, migration 101, kept separate from
-- research_summaries, which stays reserved for project-scoped Intelligence
-- only).
--
-- Two tables:
--
-- 1. library_documents — the reusable asset row, plus its CURRENT,
--    user-approved, filterable metadata as real columns (not buried in
--    jsonb) — this is what the Research Library's search/filter page
--    queries directly. The richer narrative content (key findings,
--    statistics, methodology, limitations, page references) deliberately
--    does NOT live here — see library_document_analysis (migration 101).
--    document_type is a single flexible enum with an 'other' catch-all,
--    not a separate table per category — Industry Report, Case Study etc.
--    are values of this one column, matching how study_type/research_subject/
--    content_type already work elsewhere in this schema. Nothing here is
--    read or written by any app code yet.
--
-- 2. library_document_chunks — page/section-level extracted text, one row
--    per chunk, giving findings real page/section provenance to cite. No
--    embedding column yet — pgvector is not enabled in this database and
--    is deliberately not being added now (keyword/tag search via
--    library_documents.search_vector below is sufficient for the first
--    release); a nullable `embedding vector(n)` column can be added here
--    later with a single additive ALTER TABLE, once pgvector is enabled,
--    with no restructuring of this table required.
--
-- Everything here is additive and net-new — no existing table is touched
-- except research_project_evidence's evidence_type CHECK, which already
-- permits 'document' since migration 069 and needs no change.

-- ── 1. library_documents ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS library_documents (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Always set at upload time (defaults to the original filename in app
  -- code, never null) — overwritten with the AI-suggested, user-approved
  -- title once its analysis is approved (migration 101's promotion step).
  title                 text        NOT NULL,

  -- One flexible type field, not a separate table per category — see this
  -- migration's header comment.
  document_type         text        NOT NULL DEFAULT 'other'
                        CHECK (document_type IN (
                          'industry_report', 'case_study', 'benchmark', 'research_paper',
                          'client_document', 'strategy_document', 'audience_study',
                          'sponsorship_evaluation', 'market_report', 'internal_research', 'other'
                        )),

  source_publisher      text,
  publication_date      date,

  -- Filterable dimensions — AI-suggested at analysis time, user-editable
  -- before approval, promoted from library_document_analysis.edited_content
  -- (or .content, if never edited) at approval time. Empty array, never
  -- null, so every list-page filter can treat "no values" uniformly.
  markets               text[]      NOT NULL DEFAULT '{}',
  sports_competitions   text[]      NOT NULL DEFAULT '{}',
  audience_segments     text[]      NOT NULL DEFAULT '{}',
  brands_mentioned      text[]      NOT NULL DEFAULT '{}',
  topics                text[]      NOT NULL DEFAULT '{}',
  tags                  text[]      NOT NULL DEFAULT '{}',

  -- Reuses research_projects.confidentiality's exact vocabulary (migration
  -- 071) — defaults to 'internal' rather than that table's nullable/unset,
  -- since an uploaded file needs a safe-by-default access posture from the
  -- moment it lands, not an optional afterthought. Captured now; not yet
  -- enforced differentially anywhere in the app (V1 keeps the whole
  -- Library admin-only regardless of this value) — see this table's
  -- deletion/access notes in the Research Sources expansion plan.
  confidentiality        text       NOT NULL DEFAULT 'internal'
                        CHECK (confidentiality IN ('public', 'internal', 'confidential')),

  -- Ingestion pipeline state — same shape as social_searches'
  -- reddit_collection_status (migration 067): a single status column with
  -- a terminal 'failed' state and a paired error_message, polled by the
  -- client the same way.
  status                text        NOT NULL DEFAULT 'uploaded'
                        CHECK (status IN ('uploaded', 'extracting', 'analysing', 'pending_review', 'approved', 'failed')),
  error_message         text,

  -- File storage — the object itself lives in Supabase Storage, private
  -- bucket (migration 100), never a public URL. storage_bucket is a column
  -- rather than a hardcoded constant purely so a future second bucket
  -- (e.g. a cold-storage tier) never requires a schema change.
  storage_bucket         text       NOT NULL DEFAULT 'library-documents',
  storage_path            text      NOT NULL,
  original_filename       text      NOT NULL,
  mime_type                text     NOT NULL,
  file_size_bytes          bigint   NOT NULL,
  page_count                integer,

  uploaded_by            text,
  uploaded_at            timestamptz NOT NULL DEFAULT now(),
  approved_by            text,
  approved_at            timestamptz,

  -- Soft delete, matching house convention (surveys, research_projects,
  -- organisations). A soft-deleted document disappears from Library
  -- search but is never force-detached from any project already using it
  -- as evidence — that project's existing Intelligence output stays intact
  -- and auditable. The underlying Storage object is never removed on a
  -- soft delete either.
  deleted_at             timestamptz,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  -- Server-side keyword search over metadata — trigger-maintained below,
  -- not a GENERATED column: to_tsvector(regconfig, text) is STABLE, not
  -- IMMUTABLE, in Postgres's own function catalog, even with a literal
  -- config name like 'english' — text search configurations are
  -- technically alterable at runtime (ALTER TEXT SEARCH CONFIGURATION), so
  -- Postgres won't accept it in a GENERATED column's expression. A
  -- BEFORE INSERT OR UPDATE trigger achieves the same "app code never
  -- maintains this directly, can't drift out of sync" property. No
  -- pgvector involved — this is core Postgres full-text search, sufficient
  -- for the Library's first release; semantic search can be layered on
  -- later without touching this column.
  search_vector          tsvector
);

CREATE INDEX IF NOT EXISTS idx_library_documents_search_vector ON library_documents USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_library_documents_document_type ON library_documents (document_type);
CREATE INDEX IF NOT EXISTS idx_library_documents_status ON library_documents (status);
CREATE INDEX IF NOT EXISTS idx_library_documents_deleted_at ON library_documents (deleted_at);

CREATE OR REPLACE FUNCTION set_library_documents_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS library_documents_updated_at ON library_documents;
CREATE TRIGGER library_documents_updated_at
  BEFORE UPDATE ON library_documents
  FOR EACH ROW EXECUTE FUNCTION set_library_documents_updated_at();

CREATE OR REPLACE FUNCTION set_library_documents_search_vector()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.title, '') || ' ' ||
    coalesce(NEW.source_publisher, '') || ' ' ||
    coalesce(array_to_string(NEW.tags, ' '), '') || ' ' ||
    coalesce(array_to_string(NEW.topics, ' '), '') || ' ' ||
    coalesce(array_to_string(NEW.brands_mentioned, ' '), '') || ' ' ||
    coalesce(array_to_string(NEW.markets, ' '), '') || ' ' ||
    coalesce(array_to_string(NEW.sports_competitions, ' '), '')
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS library_documents_search_vector ON library_documents;
CREATE TRIGGER library_documents_search_vector
  BEFORE INSERT OR UPDATE ON library_documents
  FOR EACH ROW EXECUTE FUNCTION set_library_documents_search_vector();

ALTER TABLE library_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_library_documents" ON library_documents USING (false);

-- ── 2. library_document_chunks ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS library_document_chunks (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  library_document_id uuid        NOT NULL REFERENCES library_documents(id) ON DELETE CASCADE,

  chunk_index         integer     NOT NULL,
  -- PDF extraction is page-boundary-aware, so both are set. DOCX has no
  -- native page concept — page_start/page_end stay null there and
  -- section_label (a heading-derived label) is used instead, a real,
  -- disclosed limitation rather than a fabricated page number.
  page_start           integer,
  page_end              integer,
  section_label          text,

  chunk_text            text      NOT NULL,

  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_library_document_chunks_unique
  ON library_document_chunks (library_document_id, chunk_index);

ALTER TABLE library_document_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_library_document_chunks" ON library_document_chunks USING (false);

-- Rollback:
--   DROP TABLE IF EXISTS library_document_chunks;
--   DROP TRIGGER IF EXISTS library_documents_search_vector ON library_documents;
--   DROP FUNCTION IF EXISTS set_library_documents_search_vector();
--   DROP TRIGGER IF EXISTS library_documents_updated_at ON library_documents;
--   DROP FUNCTION IF EXISTS set_library_documents_updated_at();
--   DROP TABLE IF EXISTS library_documents;
