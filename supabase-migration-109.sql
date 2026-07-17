-- Migration 109: Backfill responses.survey_id from the owning campaign.
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Responses submitted through a CAMPAIGN embed were stored with
-- responses.survey_id = NULL: the embed identifies the survey by campaign
-- slug, and /api/submit only wrote the survey_id the client sent (none, for
-- campaign embeds). vw_survey_stats counts responses WHERE survey_id = surveys.id,
-- so every survey deployed purely via campaigns read 0 responses — which also
-- kept Survey Intelligence's readiness gate (MIN_RESPONSES) permanently at 0/N.
--
-- /api/submit now resolves the effective survey server-side for new responses;
-- this migration repairs the rows already stored. It attributes each response
-- to its campaign's EFFECTIVE survey — the campaign's own survey_id, or the
-- linked research project's survey_id when the campaign inherits it (survey_id
-- NULL) — mirroring the embed/campaign resolution.
--
-- responses.survey_id is text (migration 002); surveys.id is uuid, so the
-- resolved id is cast to text to match the column and vw_survey_stats' compare.
--
-- IDEMPOTENT / SAFE TO RE-RUN:
--   * Only rows where responses.survey_id IS NULL are touched — an existing,
--     non-null survey_id is NEVER overwritten.
--   * Only rows whose campaign resolves to a non-null effective survey are set;
--     everything else is left untouched.
--   * A second run finds those rows already populated (survey_id no longer NULL)
--     and updates nothing. Purely additive; no schema change.
--   * DISTINCT ON collapses any duplicate campaign slug (e.g. a soft-deleted
--     campaign reusing a slug) to a single deterministic survey — preferring a
--     live campaign, then the most recent — so the join can't multiply rows.

UPDATE responses r
SET survey_id = sub.effective_survey_id::text
FROM (
  SELECT DISTINCT ON (c.campaign_id)
    c.campaign_id,
    COALESCE(c.survey_id, rp.survey_id) AS effective_survey_id
  FROM campaigns c
  LEFT JOIN research_projects rp ON rp.id = c.research_project_id
  WHERE COALESCE(c.survey_id, rp.survey_id) IS NOT NULL
  ORDER BY c.campaign_id, (c.deleted_at IS NULL) DESC, c.created_at DESC
) sub
WHERE r.campaign_id = sub.campaign_id
  AND r.survey_id IS NULL;

-- Verify (optional) — should report 0 once collection is only via campaigns
-- whose survey resolves:
--   SELECT COUNT(*) AS still_null
--   FROM responses r
--   JOIN campaigns c ON c.campaign_id = r.campaign_id
--   LEFT JOIN research_projects rp ON rp.id = c.research_project_id
--   WHERE r.survey_id IS NULL
--     AND COALESCE(c.survey_id, rp.survey_id) IS NOT NULL;
--
-- Rollback: none. This only fills previously-NULL values with the correct
-- survey attribution; there is no prior state to restore.
