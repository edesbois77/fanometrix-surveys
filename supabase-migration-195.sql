-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 195 — FedEx v1 campaign→survey provenance reconciliation (STEP 1 ONLY)
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠ DATA RECONCILIATION (not a schema change). Approved: Step 1 only.
--
-- Problem: survey "FedEx UCL Sponsorship 26/27 - Survey" (v1, 155c6cd5…) collected
-- 196 historic responses through 18 deployment campaigns of research project
-- 8fec797b… (which itself DECLARES survey_id = 155c6cd5…). Those campaigns were
-- created by the legacy deployment path with campaigns.survey_id = NULL (the survey
-- is derived from research_projects.survey_id there). Discover Dashboards derive the
-- survey universe from campaigns.survey_id, so v1 is invisible — its campaign→survey
-- provenance is severed. This relinks exactly those 18 campaigns to v1.
--
-- ⚠ SCOPE CORRECTION (guarded apply on 2026-08-16 found 20, not 18):
--   Research project 8fec797b has 20 LIVE campaigns with survey_id IS NULL, all of
--   which are v1's deployment cells (the RP itself declares survey_id = v1). They
--   split as:
--     • 18 that carried v1's 196 responses, AND
--     • 2 FotMob cells (Italy, United Kingdom) with ZERO responses / ~zero events
--       (fedex_..._italy_fotmob, fedex_..._united_kingdom_fotmob; status=closed).
--   The 2 zero-data cells are still v1's by RP provenance; they add nothing to any
--   metric. This migration relinks ALL 20 (the RP-declared v1 deployment set), which
--   is the provenance-correct interpretation. Metrics are identical either way; the
--   only difference is v1's campaign count (20 vs 18).  ← AWAIT EXPLICIT APPROVAL of
--   "20 (all RP deployments)" vs "18 (response-carrying only)" before applying.
--
-- SCOPE / SAFETY (verified by forensic audit 2026-08-16):
--   • Affected set = live campaigns of RP 8fec797b with survey_id IS NULL (=20).
--   • RP 8fec797b DECLARES survey_id = v1, so all are v1's deployments.
--   • No cross-attribution: none of these campaigns carry a response for any OTHER
--     survey (asserted). No overlap with v2's 2 campaigns.
--   • Response rows are NOT touched (responses.survey_id already = v1).
--   • NO entitlement/ORE change (Step 2 deliberately NOT performed — operator/admin
--     visibility only for now). NO change to Research Projects behaviour
--     (that path reads research_projects.survey_id, unchanged).
--
-- Idempotent + guarded: aborts (transaction rolls back) unless the provenance is
-- exactly as verified; a re-run after success is a no-op.
--
-- ROLLBACK (run manually to revert):
--   UPDATE campaigns SET survey_id = NULL
--    WHERE research_project_id = '8fec797b-768f-4aee-88ab-883c6a1bf719'
--      AND survey_id = '155c6cd5-5bf1-4c85-b0f7-e4acb4ff6f65' AND deleted_at IS NULL;
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_survey  uuid := '155c6cd5-5bf1-4c85-b0f7-e4acb4ff6f65';
  v_rp      uuid := '8fec797b-768f-4aee-88ab-883c6a1bf719';
  v_expect  int  := 20;   -- ← the RP-declared v1 deployment set (18 with data + 2 zero-data)
  v_target  int;
  v_linked  int;
  v_rpsurvey uuid;
  v_updated int;
BEGIN
  SELECT survey_id INTO v_rpsurvey FROM research_projects WHERE id = v_rp;
  SELECT count(*) INTO v_target
    FROM campaigns WHERE research_project_id = v_rp AND survey_id IS NULL AND deleted_at IS NULL;
  SELECT count(*) INTO v_linked
    FROM campaigns WHERE research_project_id = v_rp AND survey_id = v_survey AND deleted_at IS NULL;

  -- Idempotency: already applied (none left to link, expected set already linked).
  IF v_target = 0 AND v_linked = v_expect THEN
    RAISE NOTICE 'Migration 195: already applied (% campaigns linked to v1); no-op.', v_linked;
    RETURN;
  END IF;

  -- Provenance guards.
  IF v_rpsurvey IS DISTINCT FROM v_survey THEN
    RAISE EXCEPTION 'Migration 195 aborted: research_project % does not declare survey_id = v1 (found %).', v_rp, v_rpsurvey;
  END IF;
  IF v_target <> v_expect THEN
    RAISE EXCEPTION 'Migration 195 aborted: expected % RP null-survey live campaigns, found %.', v_expect, v_target;
  END IF;
  -- No cross-attribution: none of the target campaigns carry a response for ANY survey other than v1.
  IF EXISTS (
    SELECT 1 FROM responses r
     JOIN campaigns c ON c.campaign_id = r.campaign_id
    WHERE c.research_project_id = v_rp AND c.survey_id IS NULL AND c.deleted_at IS NULL
      AND r.is_demo = false AND r.survey_id IS DISTINCT FROM v_survey
  ) THEN
    RAISE EXCEPTION 'Migration 195 aborted: a target campaign carries a response for a survey other than v1.';
  END IF;

  UPDATE campaigns SET survey_id = v_survey
   WHERE research_project_id = v_rp AND survey_id IS NULL AND deleted_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_expect THEN
    RAISE EXCEPTION 'Migration 195 aborted: updated % rows, expected %.', v_updated, v_expect;
  END IF;
  RAISE NOTICE 'Migration 195: relinked % campaigns to FedEx v1 (%).', v_updated, v_survey;
END $$;
