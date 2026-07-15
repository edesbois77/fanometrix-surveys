-- Migration 070: Research Project UX refinement — brief fields, activity log
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Supports turning the Research Project workspace into a research brief +
-- progress tracker (Research Question → Evidence → AI Intelligence →
-- Report → Conclusion → Knowledge), rather than a deployment-config page.
-- Everything here is additive: no column is dropped, renamed, or has its
-- type changed, and every new research_projects column is nullable (the
-- "Research Question is required" rule is enforced at the application
-- layer for new projects only, so existing rows keep working).
--
-- Three changes:
--
-- 1. research_projects — three new columns:
--    - research_question: the question every piece of evidence on this
--      project is ultimately trying to answer. Distinct from project_name
--      (the container's label) — see the app-layer discussion this
--      migration accompanies.
--    - objective (optional): a narrower, commercial framing of the
--      question, e.g. "Understand which commercial activations fans value
--      most."
--    - research_subject: what the project is about (brand/club/league/
--      tournament/publisher/federation/custom) — orthogonal to the
--      existing study_type column, which describes the research
--      methodology (fan_understanding/brand_health/etc.) and stays
--      completely untouched here, since it's shared with campaigns,
--      campaign_groups and surveys.
--
-- 2. research_project_activity — new table. A permanent, append-only
--    event log for a project's lifecycle, replacing the placeholder
--    "No activity yet" empty state. Only a handful of event types get a
--    write-site in the application code this migration accompanies
--    (project_created, project_updated, research_source_added,
--    deployments_generated, survey_status_changed); the rest
--    (survey_created, report_generated, report_approved, report_published,
--    knowledge_article_created) are included in the CHECK constraint now,
--    ahead of the features that will emit them, so the constraint never
--    needs widening for this batch of foreseeable event types.
--
-- 3. vw_research_project_stats — widened (CREATE OR REPLACE) to add
--    last_response_at, mirroring vw_survey_stats' existing
--    MAX(responses.created_at) pattern (migration 011/013/027) so the
--    Workspace can show a genuine "last updated" signal instead of only
--    status-change timestamps.

-- ── 1. research_projects — brief fields ─────────────────────────────────────

ALTER TABLE research_projects
  ADD COLUMN IF NOT EXISTS research_question text,
  ADD COLUMN IF NOT EXISTS objective          text,
  ADD COLUMN IF NOT EXISTS research_subject   text
    CHECK (research_subject IN ('brand', 'club', 'league', 'tournament', 'publisher', 'federation', 'custom'));

-- ── 2. research_project_activity ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS research_project_activity (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  research_project_id uuid        NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  event_type           text        NOT NULL CHECK (event_type IN (
                          'project_created', 'project_updated', 'research_source_added',
                          'survey_created', 'deployments_generated',
                          'survey_status_changed', 'report_generated',
                          'report_approved', 'report_published', 'knowledge_article_created'
                        )),
  description          text        NOT NULL,
  actor                text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_project_activity_project
  ON research_project_activity (research_project_id, created_at DESC);

ALTER TABLE research_project_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_research_project_activity" ON research_project_activity USING (false);

-- ── 3. vw_research_project_stats — add last_response_at ─────────────────────

CREATE OR REPLACE VIEW vw_research_project_stats AS
SELECT
  p.id                                  AS project_db_id,
  p.project_id,
  COUNT(DISTINCT c.id)                  AS deployment_count,
  COUNT(DISTINCT c.publisher_org_id)    AS publisher_count,
  COUNT(DISTINCT c.country_code)        AS country_count,
  COALESCE(SUM(vcs.response_count), 0)  AS total_responses,
  MAX(r.created_at)                     AS last_response_at
FROM research_projects p
LEFT JOIN campaigns c
  ON c.research_project_id = p.id AND c.deleted_at IS NULL
LEFT JOIN vw_campaign_stats vcs
  ON vcs.campaign_id = c.campaign_id
LEFT JOIN responses r
  ON r.campaign_id = c.campaign_id AND (r.is_demo = false OR r.is_demo IS NULL)
GROUP BY p.id, p.project_id;

GRANT SELECT ON vw_research_project_stats TO anon, authenticated;

-- Rollback:
--   CREATE OR REPLACE VIEW vw_research_project_stats AS
--   SELECT p.id AS project_db_id, p.project_id, COUNT(DISTINCT c.id) AS deployment_count,
--     COUNT(DISTINCT c.publisher_org_id) AS publisher_count, COUNT(DISTINCT c.country_code) AS country_count,
--     COALESCE(SUM(vcs.response_count), 0) AS total_responses
--   FROM research_projects p
--   LEFT JOIN campaigns c ON c.research_project_id = p.id AND c.deleted_at IS NULL
--   LEFT JOIN vw_campaign_stats vcs ON vcs.campaign_id = c.campaign_id
--   GROUP BY p.id, p.project_id;
--   GRANT SELECT ON vw_research_project_stats TO anon, authenticated;
--   DROP TABLE IF EXISTS research_project_activity;
--   ALTER TABLE research_projects DROP COLUMN IF EXISTS research_question,
--     DROP COLUMN IF EXISTS objective, DROP COLUMN IF EXISTS research_subject;
