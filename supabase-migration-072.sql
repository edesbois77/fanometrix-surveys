-- Migration 072: Research Behaviour — target-reached action, derived Status
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- QA Round 2: the Research Project owns one master Research Target, with a
-- configurable action for when it's reached (Continue / Pause / Close), and
-- the project's own Status becomes fully derived (never a manual dropdown):
--   Draft = no active campaigns yet
--   Active = one or more live/paused campaigns
--   Complete = research target reached, or manually closed
--   Archived = manually archived
-- `completed_at`/`archived_at` are the two manual triggers behind Complete/
-- Archived; `target_reached_at` is the idempotency guard for the write-path
-- auto-transition check (never computed inside a GET route).

ALTER TABLE research_projects
  ADD COLUMN IF NOT EXISTS target_reached_action text
    CHECK (target_reached_action IN ('none', 'pause', 'close')),
  ADD COLUMN IF NOT EXISTS target_reached_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Widen the existing rollup so the list page can derive "has an active
-- campaign" without a second query — additive column on an existing view.
CREATE OR REPLACE VIEW vw_research_project_stats AS
SELECT
  p.id                                    AS project_db_id,
  p.project_id,
  COUNT(DISTINCT c.id)                    AS deployment_count,
  COUNT(DISTINCT c.publisher_org_id)      AS publisher_count,
  COUNT(DISTINCT c.country_code)          AS country_count,
  COALESCE(SUM(vcs.response_count), 0)    AS total_responses,
  MAX(r.created_at)                       AS last_response_at,
  BOOL_OR(c.status IN ('live', 'paused')) AS has_active_campaign
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
--   ALTER TABLE research_projects
--     DROP COLUMN IF EXISTS target_reached_action,
--     DROP COLUMN IF EXISTS target_reached_at,
--     DROP COLUMN IF EXISTS completed_at,
--     DROP COLUMN IF EXISTS archived_at;
--   CREATE OR REPLACE VIEW vw_research_project_stats AS
--   SELECT p.id AS project_db_id, p.project_id, COUNT(DISTINCT c.id) AS deployment_count,
--     COUNT(DISTINCT c.publisher_org_id) AS publisher_count, COUNT(DISTINCT c.country_code) AS country_count,
--     COALESCE(SUM(vcs.response_count), 0) AS total_responses, MAX(r.created_at) AS last_response_at
--   FROM research_projects p
--   LEFT JOIN campaigns c ON c.research_project_id = p.id AND c.deleted_at IS NULL
--   LEFT JOIN vw_campaign_stats vcs ON vcs.campaign_id = c.campaign_id
--   LEFT JOIN responses r ON r.campaign_id = c.campaign_id AND (r.is_demo = false OR r.is_demo IS NULL)
--   GROUP BY p.id, p.project_id;
--   GRANT SELECT ON vw_research_project_stats TO anon, authenticated;
