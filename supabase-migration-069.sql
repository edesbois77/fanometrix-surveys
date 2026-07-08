-- Migration 069: V2 Phase 0 — Research Project Evidence + Intelligence Asset foundation
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Pure schema foundation for the Fanometrix V2 migration described in the
-- product blueprint (evolving the platform toward the "Research Question →
-- Discovery → Research Project → Evidence → Intelligence Engine →
-- Intelligence Assets → Reports → Knowledge" architecture). Nothing in this
-- migration is read or written by any app code yet — it exists so later
-- phases (Survey Intelligence, the Research Project detail page, cross-source
-- synthesis) can ship as pure application changes with no further schema
-- work. Everything here is additive: no column is dropped, renamed, or has
-- its type changed, and every new column is nullable.
--
-- Four changes:
--
-- 1. research_project_evidence — new table. The seam that lets a Research
--    Project hold more than one survey and any number of social listening
--    searches at once (today a project has at most one survey via
--    research_projects.survey_id, and zero relationship to social_searches
--    at all). research_projects.survey_id is left untouched as the legacy
--    "primary survey" pointer — nothing here requires backfilling it.
--
-- 2. research_summaries.source_type — widen the CHECK constraint to add
--    'survey' alongside the existing 'conversation_search'. This is the
--    exact narrow-on-purpose constraint migration 068 flagged for widening
--    "once a second analyst function ships" — Phase 1 of the blueprint adds
--    that analyst (analyseSurvey.ts); this migration only makes room for it.
--    output_type is deliberately NOT widened here — the blueprint's decision
--    is to keep it generic and let source_type carry the distinction.
--
-- 3. research_summaries trust-metadata columns — nullable confidence/
--    consensus/coverage/freshness_at, corresponding to the manifesto's four
--    trust dimensions. Kept as free-form text for confidence/consensus
--    (High/Medium/Low), consistent with the existing three-tier scale
--    app/components/InsightsEngine.tsx already uses on the dashboard, rather
--    than inventing a new numeric scale nothing produces yet.
--
-- 4. insights.research_project_id / research_summary_id — nullable FKs so a
--    Report can eventually be a snapshot of a real Research Project /
--    Intelligence Asset instead of a freehand, evidence-disconnected
--    content_blocks blob. Every existing insights row keeps working with
--    both columns NULL.

-- ── 1. research_project_evidence ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS research_project_evidence (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  research_project_id uuid        NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,

  -- Polymorphic, mirroring research_summaries' source_type/source_id shape.
  -- 'document' is included for a future uploaded-document evidence type
  -- (not built yet) so this CHECK doesn't need widening for that later.
  evidence_type       text        NOT NULL CHECK (evidence_type IN ('survey', 'social_search', 'document')),
  evidence_id         uuid        NOT NULL,

  added_by            text,
  added_at            timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- One evidence row per (project, source) — attaching the same survey/search
-- to a project twice is a no-op, not a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS idx_research_project_evidence_unique
  ON research_project_evidence (research_project_id, evidence_type, evidence_id);

CREATE INDEX IF NOT EXISTS idx_research_project_evidence_project
  ON research_project_evidence (research_project_id);

ALTER TABLE research_project_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_research_project_evidence" ON research_project_evidence USING (false);

-- ── 2. research_summaries.source_type — widen to allow 'survey' ────────────

ALTER TABLE research_summaries DROP CONSTRAINT IF EXISTS research_summaries_source_type_check;
ALTER TABLE research_summaries ADD CONSTRAINT research_summaries_source_type_check
  CHECK (source_type IN ('conversation_search', 'survey'));

-- ── 3. research_summaries — trust-metadata columns (all nullable) ──────────

ALTER TABLE research_summaries
  ADD COLUMN IF NOT EXISTS confidence   text CHECK (confidence   IN ('high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS consensus    text CHECK (consensus    IN ('high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS coverage     text,
  ADD COLUMN IF NOT EXISTS freshness_at timestamptz;

-- ── 4. insights — nullable links to the project/finding it snapshots ───────

ALTER TABLE insights
  ADD COLUMN IF NOT EXISTS research_project_id uuid REFERENCES research_projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS research_summary_id uuid REFERENCES research_summaries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_insights_research_project_id ON insights (research_project_id);

-- Rollback:
--   DROP INDEX IF EXISTS idx_insights_research_project_id;
--   ALTER TABLE insights DROP COLUMN IF EXISTS research_project_id, DROP COLUMN IF EXISTS research_summary_id;
--   ALTER TABLE research_summaries DROP COLUMN IF EXISTS confidence, DROP COLUMN IF EXISTS consensus,
--     DROP COLUMN IF EXISTS coverage, DROP COLUMN IF EXISTS freshness_at;
--   ALTER TABLE research_summaries DROP CONSTRAINT IF EXISTS research_summaries_source_type_check;
--   ALTER TABLE research_summaries ADD CONSTRAINT research_summaries_source_type_check
--     CHECK (source_type IN ('conversation_search'));
--   DROP TABLE IF EXISTS research_project_evidence;
