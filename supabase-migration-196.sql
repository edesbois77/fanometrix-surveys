-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 196 — dashboard_answer_series RPC (Answers-per-day)  ✅ APPLIED IN PROD
-- ─────────────────────────────────────────────────────────────────────────────
-- Enables "Answers collected" as a Collection-over-time series (the research-yield
-- default). Provides a governed daily aggregation over response_answers. A bounded,
-- scoped RPC mirroring dashboard_event_counts / dashboard_event_series:
--   • buckets valid response_answers by day (created_at),
--   • constrained to an authorised campaign-slug set (never raw-row egress),
--   • real-only (is_demo = false),
--   • optional question_index filter.
-- Cost: one indexed range scan over the campaign-filtered rows. The supporting
-- index below makes the (campaign_id, created_at) scan efficient.
--
-- STATUS: APPLIED in production (verified 2026-08-18); the function + index below
-- are byte-identical to the live definition. This file is the source-of-truth
-- record only — do NOT re-apply or edit the DDL. Additive; no data change.
-- Rollback: DROP FUNCTION dashboard_answer_series(text[], timestamptz, timestamptz, int);
--           DROP INDEX IF EXISTS idx_response_answers_campaign_created;
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_response_answers_campaign_created
  ON response_answers (campaign_id, created_at)
  WHERE is_demo = false;

CREATE OR REPLACE FUNCTION dashboard_answer_series(
  p_campaign_ids text[],
  p_from timestamptz DEFAULT NULL,
  p_to   timestamptz DEFAULT NULL,
  p_question_index int DEFAULT NULL
) RETURNS TABLE (bucket_hour timestamptz, event_count bigint)
LANGUAGE sql STABLE AS $$
  SELECT date_trunc('day', ra.created_at) AS bucket_hour, count(*)::bigint AS event_count
    FROM response_answers ra
   WHERE ra.is_demo = false
     AND (p_campaign_ids IS NULL OR ra.campaign_id = ANY (p_campaign_ids))
     AND (p_from IS NULL OR ra.created_at >= p_from)
     AND (p_to   IS NULL OR ra.created_at <  p_to)
     AND (p_question_index IS NULL OR ra.question_index = p_question_index)
   GROUP BY 1
   ORDER BY 1;
$$;
