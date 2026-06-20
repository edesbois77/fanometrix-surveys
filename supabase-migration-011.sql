-- Migration 011: Survey lifecycle refactor
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Changes:
--   • Replaces survey statuses Live/Completed with Ready/Deleted
--   • Adds lifecycle metadata columns (created_by, archived_at, deleted_at, deleted_by, delete_reason)
--   • Removes start_date/end_date from surveys (delivery dates belong to campaigns)
--   • Creates vw_survey_stats view (campaign_count, live_campaign_count, response_count)

BEGIN;

-- ── 1. Drop old status constraint ─────────────────────────────────────────────
ALTER TABLE surveys DROP CONSTRAINT IF EXISTS surveys_status_check;

-- ── 2. Migrate existing status values ─────────────────────────────────────────
UPDATE surveys SET status = 'ready'    WHERE status = 'live';
UPDATE surveys SET status = 'archived' WHERE status = 'completed';

-- ── 3. Apply new status constraint ────────────────────────────────────────────
ALTER TABLE surveys
  ADD CONSTRAINT surveys_status_check
  CHECK (status IN ('draft', 'ready', 'archived', 'deleted'));

-- ── 4. Add lifecycle metadata columns ─────────────────────────────────────────
ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS created_by    text,
  ADD COLUMN IF NOT EXISTS archived_at   timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at    timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by    text,
  ADD COLUMN IF NOT EXISTS delete_reason text;

-- ── 5. Remove delivery date columns (belong to campaigns, not surveys) ─────────
ALTER TABLE surveys
  DROP COLUMN IF EXISTS start_date,
  DROP COLUMN IF EXISTS end_date;

-- ── 6. Survey stats view ───────────────────────────────────────────────────────
-- Computes campaign_count, live_campaign_count, response_count per survey.
-- Used in the admin API to enrich survey cards without N+1 queries.
DROP VIEW IF EXISTS vw_survey_stats;
CREATE VIEW vw_survey_stats AS
SELECT
  s.id,
  COALESCE(c.campaign_count,      0) AS campaign_count,
  COALESCE(c.live_campaign_count, 0) AS live_campaign_count,
  COALESCE(r.response_count,      0) AS response_count
FROM surveys s
LEFT JOIN (
  SELECT
    survey_id,
    COUNT(*)                                AS campaign_count,
    COUNT(*) FILTER (WHERE status = 'live') AS live_campaign_count
  FROM campaigns
  WHERE survey_id IS NOT NULL
  GROUP BY survey_id
) c ON c.survey_id = s.id
LEFT JOIN (
  SELECT
    survey_id,
    COUNT(*) AS response_count
  FROM responses
  WHERE is_demo = false
    AND survey_id IS NOT NULL
  GROUP BY survey_id
) r ON r.survey_id = s.id::text;

GRANT SELECT ON vw_survey_stats TO anon;
GRANT SELECT ON vw_survey_stats TO authenticated;

COMMIT;
