-- Migration 027: Exclude soft-deleted campaigns from vw_survey_stats
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- The campaign_count in vw_survey_stats was counting soft-deleted campaigns
-- (deleted_at IS NOT NULL), which kept the survey delete button disabled even
-- after all campaigns using that survey had been deleted.

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
    AND deleted_at IS NULL          -- exclude soft-deleted campaigns
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
