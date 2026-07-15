-- Migration 087: Fix response-count views to count simulated evidence
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Found via live testing (Phase 11, Showroom demo "Women's World Cup Brand
-- Involvement"): vw_campaign_stats, vw_survey_stats and (transitively)
-- vw_research_project_stats all filter responses on
-- `is_demo = false OR is_demo IS NULL` — written years before Simulation
-- existed, to exclude legacy QA/test-data responses from real counts.
--
-- Every simulated response is REQUIRED to have is_demo = true (migration
-- 084's asymmetric responses_campaign_provenance_match trigger). That
-- means every one of these views has always shown 0 responses for every
-- simulated survey/campaign/project, no matter how many were actually
-- generated. This is silent, not just cosmetic: Survey Intelligence's
-- readiness gate (SurveyIntelligenceModal, MIN_RESPONSES = 50) reads
-- vw_survey_stats.response_count directly, so Survey Intelligence has
-- been permanently ungeneratable for every Demo Project's survey since
-- Phase 5 — a genuinely broken Present Mode beat, not a cosmetic count.
--
-- lib/intelligence/analysts/analyseSurvey.ts hit the same is_demo
-- dual-meaning trap in Phase 8 and was fixed the same way this migration
-- fixes these views: branch on the parent's own is_simulated flag rather
-- than assuming is_demo always means "legacy test data." A simulated
-- campaign/survey's responses are unconstrained by is_demo (all of them
-- are real synthetic evidence, guaranteed true by the trigger); a real
-- campaign/survey keeps the exact existing is_demo = false exclusion,
-- unchanged, so this migration is a strict addition for simulated rows —
-- zero behaviour change for any real campaign, survey, or project.

CREATE OR REPLACE VIEW vw_campaign_stats AS
SELECT
  c.id            AS campaign_db_id,
  c.campaign_id,
  COALESCE(COUNT(r.id) FILTER (
    WHERE (c.is_simulated = false AND (r.is_demo = false OR r.is_demo IS NULL))
       OR (c.is_simulated = true)
  ), 0)           AS response_count
FROM campaigns c
LEFT JOIN responses r ON r.campaign_id = c.campaign_id
GROUP BY c.id, c.campaign_id;

GRANT SELECT ON vw_campaign_stats TO anon, authenticated;

CREATE OR REPLACE VIEW vw_survey_stats AS
SELECT
  s.id,
  COALESCE(c.campaign_count,      0) AS campaign_count,
  COALESCE(c.live_campaign_count, 0) AS live_campaign_count,
  c.last_used_at,
  COALESCE(r.response_count,      0) AS response_count,
  r.last_response_at
FROM surveys s
LEFT JOIN (
  SELECT
    survey_id,
    COUNT(*)                                AS campaign_count,
    COUNT(*) FILTER (WHERE status = 'live') AS live_campaign_count,
    MAX(created_at)                         AS last_used_at
  FROM campaigns
  WHERE survey_id IS NOT NULL
    AND deleted_at IS NULL
  GROUP BY survey_id
) c ON c.survey_id = s.id
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS response_count, MAX(created_at) AS last_response_at
  FROM responses resp
  WHERE resp.survey_id = s.id::text
    AND (
      (s.is_simulated = false AND (resp.is_demo = false OR resp.is_demo IS NULL))
      OR (s.is_simulated = true)
    )
) r ON true;

GRANT SELECT ON vw_survey_stats TO anon;
GRANT SELECT ON vw_survey_stats TO authenticated;

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
  ON r.campaign_id = c.campaign_id
  AND (
    (c.is_simulated = false AND (r.is_demo = false OR r.is_demo IS NULL))
    OR (c.is_simulated = true)
  )
GROUP BY p.id, p.project_id;

GRANT SELECT ON vw_research_project_stats TO anon, authenticated;

-- Verify (run after applying):
--   Should be > 0 for a Ready/Presented simulated survey that includes "survey" as a source:
--   SELECT s.id, s.name, s.is_simulated, vs.response_count
--   FROM surveys s JOIN vw_survey_stats vs ON vs.id = s.id
--   WHERE s.is_simulated = true;
--
--   Should be unchanged (only counts real, non-QA responses) for any real survey:
--   SELECT s.id, s.name, vs.response_count
--   FROM surveys s JOIN vw_survey_stats vs ON vs.id = s.id
--   WHERE s.is_simulated = false LIMIT 5;

-- Rollback:
--   CREATE OR REPLACE VIEW vw_campaign_stats AS
--   SELECT c.id AS campaign_db_id, c.campaign_id,
--     COALESCE(COUNT(r.id) FILTER (WHERE r.is_demo = false OR r.is_demo IS NULL), 0) AS response_count
--   FROM campaigns c LEFT JOIN responses r ON r.campaign_id = c.campaign_id
--   GROUP BY c.id, c.campaign_id;
--   GRANT SELECT ON vw_campaign_stats TO anon, authenticated;
--
--   CREATE OR REPLACE VIEW vw_survey_stats AS
--   SELECT s.id, COALESCE(c.campaign_count, 0) AS campaign_count,
--     COALESCE(c.live_campaign_count, 0) AS live_campaign_count, c.last_used_at,
--     COALESCE(r.response_count, 0) AS response_count, r.last_response_at
--   FROM surveys s
--   LEFT JOIN (SELECT survey_id, COUNT(*) AS campaign_count,
--     COUNT(*) FILTER (WHERE status = 'live') AS live_campaign_count, MAX(created_at) AS last_used_at
--     FROM campaigns WHERE survey_id IS NOT NULL AND deleted_at IS NULL GROUP BY survey_id) c ON c.survey_id = s.id
--   LEFT JOIN (SELECT survey_id, COUNT(*) AS response_count, MAX(created_at) AS last_response_at
--     FROM responses WHERE is_demo = false AND survey_id IS NOT NULL GROUP BY survey_id) r ON r.survey_id = s.id::text;
--   GRANT SELECT ON vw_survey_stats TO anon;
--   GRANT SELECT ON vw_survey_stats TO authenticated;
--
--   CREATE OR REPLACE VIEW vw_research_project_stats AS
--   SELECT p.id AS project_db_id, p.project_id, COUNT(DISTINCT c.id) AS deployment_count,
--     COUNT(DISTINCT c.publisher_org_id) AS publisher_count, COUNT(DISTINCT c.country_code) AS country_count,
--     COALESCE(SUM(vcs.response_count), 0) AS total_responses, MAX(r.created_at) AS last_response_at,
--     BOOL_OR(c.status IN ('live', 'paused')) AS has_active_campaign
--   FROM research_projects p
--   LEFT JOIN campaigns c ON c.research_project_id = p.id AND c.deleted_at IS NULL
--   LEFT JOIN vw_campaign_stats vcs ON vcs.campaign_id = c.campaign_id
--   LEFT JOIN responses r ON r.campaign_id = c.campaign_id AND (r.is_demo = false OR r.is_demo IS NULL)
--   GROUP BY p.id, p.project_id;
--   GRANT SELECT ON vw_research_project_stats TO anon, authenticated;
