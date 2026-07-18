-- Migration 121 — Researcher Notes (docs/analysis-workspace-blueprint.md §11.3)
-- Run in: supabase.com → SQL Editor → New query → Run
--
-- The human interpretation layer that lives ALONGSIDE the AI synthesis and
-- SURVIVES every regeneration. Notes are never part of the AI aspect synthesis
-- (which is regenerated wholesale); they are overlaid at read time by scope, so
-- re-synthesising Analysis never touches them. Three scopes:
--   • project — a note on the whole project (scope_ref = '')
--   • aspect  — a note on a Research Aspect (scope_ref = the aspect label)
--   • finding — a note on a specific finding (scope_ref = "<aspect>::<finding-key>",
--               a normalised key of the finding text; if the finding changes on
--               regeneration the note is KEPT and surfaced at aspect level, flagged,
--               never dropped).
-- The aspect label is a stable anchor because aspects reuse a shared vocabulary
-- across regenerations (multi-source aspect classification aligns to it).

CREATE TABLE IF NOT EXISTS research_notes (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  research_project_id  uuid        NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  scope                text        NOT NULL CHECK (scope IN ('project','aspect','finding')),
  scope_ref            text        NOT NULL DEFAULT '',
  body                 text        NOT NULL,
  author               text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_notes_project ON research_notes (research_project_id);

ALTER TABLE research_notes ENABLE ROW LEVEL SECURITY;
-- Server-only writes via the service role; deny anon (mirrors research_summaries).
DROP POLICY IF EXISTS research_notes_no_anon ON research_notes;
CREATE POLICY research_notes_no_anon ON research_notes
  FOR ALL TO anon USING (false) WITH CHECK (false);

NOTIFY pgrst, 'reload schema';

-- Rollback:
--   DROP TABLE IF EXISTS research_notes;
