-- Migration 204: P0 Supabase exposure remediation — typed completion RPC
--
-- Status: HAND-APPLY. ADDITIVE and BACKWARD-COMPATIBLE. Apply BEFORE the code
--         deploy. Safe to re-run (see "Idempotency" below).
--
-- Adds a TYPED completion RPC beside the existing one. The legacy
-- (text, integer, jsonb) signature is deliberately left in place, so both exist
-- together and currently-deployed code keeps working unchanged. PostgREST
-- resolves the overload by argument NAMES, and the two share none beyond
-- p_campaign_id/p_target, so there is no ambiguity. Migration 205 retires the
-- legacy signature, after the code deploy.
--
-- Why the typed replacement: the legacy function inserts with
--     INSERT INTO responses SELECT * FROM jsonb_populate_record(NULL::responses, p_payload)
-- which hands the caller control of EVERY column on `responses`, including
-- is_demo and evidence_simulation_id (the simulation-provenance link). It is
-- SECURITY INVOKER with no search_path and EXECUTE granted to anon, so an
-- anonymous caller can write arbitrary response rows, bypassing the
-- campaign-live, not-simulated and validation checks in /api/submit entirely.
--
-- SECURITY INVOKER here is deliberate. The only caller is /api/submit holding
-- the service role, which bypasses RLS anyway, so DEFINER would add no
-- capability — while INVOKER keeps RLS as an independent second gate if EXECUTE
-- is ever widened by accident. search_path is pinned, and every object
-- reference in the body is schema-qualified, so name resolution cannot be
-- redirected.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- FIXES THE 2026-08-20 NO-OP. The previous revision of this file opened BEGIN;
-- and never issued COMMIT;. Every statement succeeded, so the SQL editor
-- reported Success, but the transaction was still open when the session ended
-- and was discarded — leaving no function behind. This revision terminates the
-- transaction, and asserts its own outcome before committing.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

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
AS $fx$
DECLARE
  v_count integer;
BEGIN
  -- Serialise concurrent submissions for THIS campaign only. Unchanged from 187.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_campaign_id));

  SELECT pg_catalog.count(*) INTO v_count
    FROM public.responses
   WHERE campaign_id = p_campaign_id
     AND is_demo = false;

  IF v_count >= p_target THEN
    RETURN 'ceiling_reached';
  END IF;

  -- id and created_at are omitted so they take their column defaults. The jsonb
  -- form could not do that: jsonb_populate_record nulls any column absent from
  -- the payload, so the caller had to supply them.
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
    pg_catalog.coalesce(p_is_demo, false), p_group_id, p_country_code, p_market, p_survey_language
  );

  RETURN 'inserted';
END;
$fx$;

-- A newly created function is EXECUTE-able by PUBLIC by default, so the REVOKE
-- is load-bearing, not cosmetic. It runs inside this transaction: if it fails,
-- the function is not committed either.
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Self-assertion, INSIDE the transaction.
--
-- The whole point of this revision: a silent no-op must be impossible. If any
-- condition below fails, the RAISE aborts and the transaction rolls back, so
-- the migration reports an ERROR rather than Success-with-nothing-created.
-- ─────────────────────────────────────────────────────────────────────────────
DO $assert$
DECLARE
  v_typed  oid;
  v_legacy oid;
  v_config text;
BEGIN
  SELECT p.oid INTO v_typed
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'fx_submit_response_if_under_ceiling'
     AND p.pronargs = 26;
  IF v_typed IS NULL THEN
    RAISE EXCEPTION 'M204 FAILED: the typed 26-argument overload was not created';
  END IF;

  SELECT p.oid INTO v_legacy
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'fx_submit_response_if_under_ceiling'
     AND p.pronargs = 3;
  IF v_legacy IS NULL THEN
    RAISE EXCEPTION 'M204 FAILED: the legacy 3-argument overload is gone — 204 must be ADDITIVE. Retiring it is migration 205, after the code deploy.';
  END IF;

  IF pg_catalog.has_function_privilege('anon', v_typed, 'EXECUTE') THEN
    RAISE EXCEPTION 'M204 FAILED: anon holds EXECUTE on the typed overload';
  END IF;
  IF pg_catalog.has_function_privilege('authenticated', v_typed, 'EXECUTE') THEN
    RAISE EXCEPTION 'M204 FAILED: authenticated holds EXECUTE on the typed overload';
  END IF;
  IF NOT pg_catalog.has_function_privilege('service_role', v_typed, 'EXECUTE') THEN
    RAISE EXCEPTION 'M204 FAILED: service_role lacks EXECUTE on the typed overload';
  END IF;

  -- Asserts that search_path is PINNED, not that it holds a particular string.
  -- Postgres stores proconfig as the raw SET value, and no function in this
  -- database currently has a multi-element search_path to confirm the exact
  -- stored form against. A pattern matched too tightly would abort a correct
  -- migration, so this checks the property that matters and prints the actual
  -- value for inspection. Safety does not rest on the value alone: every object
  -- reference in the body above is schema-qualified, so resolution cannot be
  -- redirected regardless of what search_path contains.
  SELECT pg_catalog.array_to_string(p.proconfig, ', ') INTO v_config
    FROM pg_proc p WHERE p.oid = v_typed;
  IF v_config IS NULL OR v_config NOT LIKE 'search_path=%' THEN
    RAISE EXCEPTION 'M204 FAILED: search_path is not pinned on the typed overload (proconfig = %)',
      pg_catalog.coalesce(v_config, '<null>');
  END IF;

  RAISE NOTICE 'M204 OK: typed overload created (26 args), legacy overload intact (3 args), EXECUTE is service_role only, % .', v_config;
END
$assert$;

COMMIT;
