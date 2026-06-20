-- Migration 012: Survey stats — add last_used_at and last_response_at
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Replaces vw_survey_stats with an updated version that adds:
--   last_used_at     — created_at of the most recently added campaign using this survey
--   last_response_at — created_at of the most recent non-demo response for this survey

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
  GROUP BY survey_id
) c ON c.survey_id = s.id
LEFT JOIN (
  SELECT
    survey_id,
    COUNT(*)     AS response_count,
    MAX(created_at) AS last_response_at
  FROM responses
  WHERE is_demo = false
    AND survey_id IS NOT NULL
  GROUP BY survey_id
) r ON r.survey_id = s.id::text;

GRANT SELECT ON vw_survey_stats TO anon;
GRANT SELECT ON vw_survey_stats TO authenticated;
