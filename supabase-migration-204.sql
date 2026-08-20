-- Migration 204: P0 Supabase exposure remediation
--
-- Status: HAND-APPLY. Do NOT auto-apply. ADDITIVE and BACKWARD-COMPATIBLE —
--         apply this BEFORE the code deploy.
--
--         This migration only ADDS the typed completion RPC. The old
--         (text, integer, jsonb) signature is left in place, so both exist
--         together and the currently-deployed code keeps working unchanged.
--         PostgREST resolves the overload by argument NAMES, and the two
--         signatures share none beyond p_campaign_id/p_target, so there is no
--         ambiguity.
--
--         Splitting it this way removes a coupling that would otherwise exist:
--         if the drop and the create landed together, the application commit
--         calling the new signature could not be reverted on its own. With this
--         split, migration 204 is safe to apply on its own and safe to leave in
--         place, and the code deploy has no database prerequisite beyond it.
--
-- Context: an anonymous read-only probe with the public anon key confirmed that
-- `responses`, `surveys`, `campaigns`, `campaign_groups`, `campaign_group_members`,
-- `vw_campaign_responses` and `vw_survey_stats` all returned rows. Mutation
-- exposure on `surveys` and `campaigns` was inferred from grants and policies and
-- deliberately NOT tested against production.
--
-- Remediation is split across two migrations:
--   204 (this file) — ADD the typed, service-role-only completion RPC. Additive.
--   205             — the lockdown: drop the old jsonb RPC, revoke anonymous
--                     EXECUTE and view SELECT, and replace every permissive
--                     "Anyone can ..." policy with deny_all_anon. Apply ONLY
--                     after the code deploy.
--
-- Reversal: supabase-migration-204-rollback.sql (drops the added function).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Typed completion RPC (additive — the jsonb signature is dropped in 205)
--
-- The previous signature was (text, integer, jsonb) and inserted with:
--     INSERT INTO responses SELECT * FROM jsonb_populate_record(NULL::responses, p_payload)
-- which handed the caller control of EVERY column on `responses`, including
-- `is_demo` and `evidence_simulation_id` — the simulation-provenance link. It was
-- SECURITY INVOKER with no search_path and EXECUTE granted to anon, so an
-- anonymous caller could write arbitrary response rows, bypassing the
-- campaign-live, not-simulated and validation checks in /api/submit entirely.
--
-- The replacement takes explicit typed parameters, so a caller can set only the
-- columns the submission path is entitled to set. Everything else keeps its
-- column default: `id` and `created_at` default server-side (the jsonb version
-- had to be passed them to stop jsonb_populate_record nulling them), and
-- `evidence_simulation_id` is now unreachable from this path.
--
-- SECURITY INVOKER is deliberate, not an oversight. The only caller is
-- /api/submit holding the service role, which bypasses RLS anyway, so DEFINER
-- would add no capability — while INVOKER keeps RLS as an independent second
-- gate if EXECUTE is ever widened by accident. search_path is pinned so an
-- unqualified name can never resolve into an attacker-controlled schema.
CREATE OR REPLACE FUNCTION public.fx_submit_response_if_under_ceiling(
  p_campaign_id               text,
  p_target                    integer,
  p_session_id                uuid    DEFAULT NULL,
  p_survey_id                 text    DEFAULT NULL,
  p_question_set_id           text    DEFAULT NULL,
  p_q1                        text    DEFAULT NULL,
  p_q2                        text    DEFAULT NULL,
  p_q3                        text    DEFAULT NULL,
  p_country                   text    DEFAULT NULL,
  p_fan_segment               text    DEFAULT NULL,
  p_gender                    text    DEFAULT NULL,
  p_age_band                  text    DEFAULT NULL,
  p_publisher                 text    DEFAULT NULL,
  p_placement                 text    DEFAULT NULL,
  p_placement_id              text    DEFAULT NULL,
  p_creative_id               text    DEFAULT NULL,
  p_club                      text    DEFAULT NULL,
  p_competition               text    DEFAULT NULL,
  p_device                    text    DEFAULT NULL,
  p_browser                   text    DEFAULT NULL,
  p_response_duration_seconds integer DEFAULT NULL,
  p_is_demo                   boolean DEFAULT false,
  p_group_id                  text    DEFAULT NULL,
  p_country_code              text    DEFAULT NULL,
  p_market                    text    DEFAULT NULL,
  p_survey_language           text    DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Serialise concurrent submissions for THIS campaign only. Unchanged from 187.
  PERFORM pg_advisory_xact_lock(hashtext(p_campaign_id));

  SELECT count(*) INTO v_count
    FROM public.responses
   WHERE campaign_id = p_campaign_id
     AND is_demo = false;

  IF v_count >= p_target THEN
    RETURN 'ceiling_reached';
  END IF;

  INSERT INTO public.responses (
    campaign_id, session_id, survey_id, question_set_id,
    q1, q2, q3, country, fan_segment, gender, age_band,
    publisher, placement, placement_id, creative_id,
    club, competition, device, browser, response_duration_seconds,
    is_demo, group_id, country_code, market, survey_language
  ) VALUES (
    p_campaign_id, p_session_id, p_survey_id, p_question_set_id,
    p_q1, p_q2, p_q3, p_country, p_fan_segment, p_gender, p_age_band,
    p_publisher, p_placement, p_placement_id, p_creative_id,
    p_club, p_competition, p_device, p_browser, p_response_duration_seconds,
    coalesce(p_is_demo, false), p_group_id, p_country_code, p_market, p_survey_language
  );

  RETURN 'inserted';
END;
$$;

REVOKE ALL ON FUNCTION public.fx_submit_response_if_under_ceiling(
  text, integer, uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, integer, boolean, text, text,
  text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fx_submit_response_if_under_ceiling(
  text, integer, uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, integer, boolean, text, text,
  text, text
) TO service_role;

