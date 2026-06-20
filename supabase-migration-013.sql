-- Migration 013: Improve last_used_at logic in vw_survey_stats
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Changes to last_used_at:
--   • Was: MAX(campaigns.created_at) — misleading because draft campaigns are included
--   • Now: MAX(COALESCE(start_date::timestamptz, created_at)) filtered to non-draft campaigns
--     — uses start_date when set (actual deployment date)
--     — falls back to created_at when start_date is null
--     — excludes draft campaigns entirely so "last used" means actually served

-- DROP first because CREATE OR REPLACE VIEW cannot reorder existing columns.
DROP VIEW IF EXISTS vw_survey_stats;

CREATE VIEW vw_survey_stats AS
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
    COUNT(*)                                                                           AS campaign_count,
    COUNT(*) FILTER (WHERE status = 'live')                                            AS live_campaign_count,
    MAX(COALESCE(start_date::timestamptz, created_at)) FILTER (WHERE status <> 'draft') AS last_used_at
  FROM campaigns
  WHERE survey_id IS NOT NULL
  GROUP BY survey_id
) c ON c.survey_id = s.id
LEFT JOIN (
  SELECT
    survey_id,
    COUNT(*)        AS response_count,
    MAX(created_at) AS last_response_at
  FROM responses
  WHERE is_demo = false
    AND survey_id IS NOT NULL
  GROUP BY survey_id
) r ON r.survey_id = s.id::text;

GRANT SELECT ON vw_survey_stats TO anon;
GRANT SELECT ON vw_survey_stats TO authenticated;
