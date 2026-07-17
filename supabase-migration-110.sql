-- Migration 110: Fix over-counted Research Project total_responses (join fanout).
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- vw_research_project_stats.total_responses is SUM(vw_campaign_stats.response_count),
-- but the view ALSO did `LEFT JOIN responses r` purely to compute
-- MAX(r.created_at) AS last_response_at. That join fans out each campaign row to
-- one row per response, so SUM(vcs.response_count) — a per-campaign constant —
-- gets added once per response and over-counts every time a campaign has more
-- than one response. A project with 19 real responses where a single campaign
-- holds 2 of them reports 21 (19 + the one extra square), which is what the
-- project homepage was showing instead of the true 19.
--
-- Fix: move last_response_at into vw_campaign_stats (one row per campaign, same
-- is_demo/is_simulated filter as the count), then have vw_research_project_stats
-- take MAX(vcs.last_response_at) and drop the fanning responses join entirely.
-- Now every campaign contributes exactly one row, so SUM(response_count) is the
-- real total. Purely a view fix — no table or data changes; safe to re-run
-- (CREATE OR REPLACE). All existing columns are preserved; vw_campaign_stats
-- only gains an additive last_response_at column.

CREATE OR REPLACE VIEW vw_campaign_stats AS
SELECT
  c.id            AS campaign_db_id,
  c.campaign_id,
  COALESCE(COUNT(r.id) FILTER (
    WHERE (c.is_simulated = false AND (r.is_demo = false OR r.is_demo IS NULL))
       OR (c.is_simulated = true)
  ), 0)           AS response_count,
  MAX(r.created_at) FILTER (
    WHERE (c.is_simulated = false AND (r.is_demo = false OR r.is_demo IS NULL))
       OR (c.is_simulated = true)
  )               AS last_response_at
FROM campaigns c
LEFT JOIN responses r ON r.campaign_id = c.campaign_id
GROUP BY c.id, c.campaign_id;

GRANT SELECT ON vw_campaign_stats TO anon;
GRANT SELECT ON vw_campaign_stats TO authenticated;

CREATE OR REPLACE VIEW vw_research_project_stats AS
SELECT
  p.id                                    AS project_db_id,
  p.project_id,
  COUNT(DISTINCT c.id)                    AS deployment_count,
  COUNT(DISTINCT c.publisher_org_id)      AS publisher_count,
  COUNT(DISTINCT c.country_code)          AS country_count,
  COALESCE(SUM(vcs.response_count), 0)    AS total_responses,
  MAX(vcs.last_response_at)               AS last_response_at,
  BOOL_OR(c.status IN ('live', 'paused')) AS has_active_campaign
FROM research_projects p
LEFT JOIN campaigns c
  ON c.research_project_id = p.id AND c.deleted_at IS NULL
LEFT JOIN vw_campaign_stats vcs
  ON vcs.campaign_id = c.campaign_id
GROUP BY p.id, p.project_id;

GRANT SELECT ON vw_research_project_stats TO anon;
GRANT SELECT ON vw_research_project_stats TO authenticated;

-- Verify (optional) — total_responses should now equal the real row count:
--   SELECT vrps.total_responses AS view_total,
--          (SELECT COUNT(*) FROM responses r
--             JOIN campaigns c ON c.campaign_id = r.campaign_id
--            WHERE c.research_project_id = p.id AND c.deleted_at IS NULL
--              AND (r.is_demo = false OR r.is_demo IS NULL)) AS real_total
--   FROM research_projects p
--   JOIN vw_research_project_stats vrps ON vrps.project_db_id = p.id
--   WHERE p.project_id = '<your project_id>';
--
-- Rollback: re-create the views from migration 087 (restores the fanout).
