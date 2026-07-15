-- Migration 101: library_document_analysis — global document analysis, review and version history
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- The AI's global, one-time analysis of a Library Document (title/publisher/
-- date/markets/sports/audiences/brands/topics/tags/key findings/statistics/
-- methodology/limitations/page references) — reviewed and approved through
-- the same draft → edited → approved workflow research_summaries already
-- established, but deliberately NOT stored in research_summaries itself.
--
-- This was an explicit architectural decision (Option B, over Option A —
-- reusing research_summaries for both global and project-specific document
-- analysis): research_summaries' polymorphic source_id always points into
-- evidence-space (a survey, a conversation search, a research project) —
-- every row in it answers "what does this evidence mean for a research
-- question." A document's global analysis answers a different question —
-- "what is this document" — true independent of whether it's ever attached
-- to a project at all, which most Library documents, most of the time,
-- won't be. Building the Library's own browse/search page on top of
-- research_summaries would make a general cataloguing feature depend on
-- infrastructure meant for research-question synthesis. Project-specific
-- Document Intelligence (added to research_summaries in migration 102,
-- source_type='document_project', source_id=research_project_evidence.id)
-- is the thing that belongs there instead — it really does answer "what
-- does this evidence mean for THIS project's research question."
--
-- Two things research_summaries doesn't do well for this case, this table
-- does directly: status has no 'published' (meaningless for a document's
-- own metadata — there's no one to publish it to), and re-analysis is
-- real version history (version/is_current) rather than an in-place
-- overwrite, so correcting a bad extraction never silently discards the
-- previously-approved analysis.
--
-- content/edited_content jsonb structure is a defined, versioned
-- TypeScript type (DocumentAnalysisContent, lib/library-documents/
-- analysis-schema.ts — added when the analyst itself ships), not
-- arbitrary JSON: it carries its own schema_version, stable per-item ids
-- for findings/statistics/methodology notes/limitations/references, and
-- explicit provenance (chunk id / page / section) on every finding. schema_version
-- is mirrored onto this table's own column below purely so a future schema
-- migration can find every row still on an old shape with a plain SQL
-- query, without parsing jsonb to do it. Validated at the application layer
-- before any write reaches this table (runtime validation, not a DB CHECK —
-- jsonb structure validation belongs in code, not SQL).

CREATE TABLE IF NOT EXISTS library_document_analysis (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  library_document_id  uuid        NOT NULL REFERENCES library_documents(id) ON DELETE CASCADE,

  -- Re-analysis version (this document's Nth analysis attempt) — distinct
  -- from schema_version below (the JSON shape's own version).
  version               integer    NOT NULL DEFAULT 1,
  -- Mirrors content->>'schema_version' — see header comment.
  schema_version         integer   NOT NULL DEFAULT 1,

  -- The AI draft, exactly as generated — never mutated, same discipline
  -- research_summaries.content already established.
  content                jsonb     NOT NULL,
  edited_content         jsonb,

  -- No 'published' — see header comment.
  status                 text      NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'edited', 'approved')),

  model                  text,
  generated_at           timestamptz NOT NULL DEFAULT now(),
  generated_by           text,
  reviewed_by            text,
  reviewed_at            timestamptz,
  approved_at            timestamptz,

  -- Exactly one current row per document — a "Re-analyse" inserts a new
  -- row at version+1 and flips the previous current row's is_current to
  -- false in the same transaction, rather than overwriting it. Previous
  -- versions stay queryable for audit but are never surfaced by default.
  is_current             boolean   NOT NULL DEFAULT true,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_library_document_analysis_current
  ON library_document_analysis (library_document_id) WHERE is_current;

CREATE INDEX IF NOT EXISTS idx_library_document_analysis_document
  ON library_document_analysis (library_document_id);

CREATE OR REPLACE FUNCTION set_library_document_analysis_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS library_document_analysis_updated_at ON library_document_analysis;
CREATE TRIGGER library_document_analysis_updated_at
  BEFORE UPDATE ON library_document_analysis
  FOR EACH ROW EXECUTE FUNCTION set_library_document_analysis_updated_at();

ALTER TABLE library_document_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_library_document_analysis" ON library_document_analysis USING (false);

-- Rollback:
--   DROP TRIGGER IF EXISTS library_document_analysis_updated_at ON library_document_analysis;
--   DROP FUNCTION IF EXISTS set_library_document_analysis_updated_at();
--   DROP TABLE IF EXISTS library_document_analysis;
