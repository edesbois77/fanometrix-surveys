-- Migration 206: repair the typed completion RPC applied by migration 204
--
-- Status: HAND-APPLY. Idempotent. Apply to any database where 204 has ALREADY
--         been applied. A fresh environment does not need this — 204's file has
--         been corrected, so running 204 alone now yields the same function.
--
-- ROOT CAUSE
-- 204 shipped the body with `pg_catalog.coalesce(p_is_demo, false)`. COALESCE is
-- a SQL construct, not a catalog function, so the qualified form does not resolve:
--     ERROR: 42883 function pg_catalog.coalesce(boolean, boolean) does not exist
--
-- plpgsql does not resolve function names when a function is CREATEd, only when
-- its statements execute. So 204 committed cleanly, its self-assertion passed,
-- and PostgREST advertised all 26 parameters — while the INSERT path was broken.
--
-- It stayed hidden because the ceiling-reached branch RETURNS before the INSERT.
-- Every call with p_target below the current count worked; only a call that had
-- to insert failed. Live symptom: /api/submit returned 500 "Failed to save
-- response" and logged reason "Database insert failed" for every completion on a
-- stop-mode campaign with a target.
--
-- Bare COALESCE needs no qualification: it is not a name lookup, so search_path
-- cannot redirect it. Every genuine function call in the body stays qualified.
--
-- Nothing else changes: same signature, same SECURITY INVOKER, same pinned
-- search_path, same grants. This only replaces the body.

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
    coalesce(p_is_demo, false), p_group_id, p_country_code, p_market, p_survey_language
  );

  RETURN 'inserted';
END;
$fx$;

-- Self-assertion INSIDE the transaction: prove the INSERT path actually runs.
-- 204's assertion checked only that the function EXISTED and was granted
-- correctly, which is exactly why the broken body got through. This one executes
-- the real INSERT branch against a temporary campaign and rolls it back, so the
-- fault 204 shipped cannot survive this migration.
DO $assert$
DECLARE
  v_out   text;
  v_probe text := 'zzz_m206_selftest_' || pg_catalog.md5(pg_catalog.clock_timestamp()::text);
  v_rows  integer;
BEGIN
  -- p_target = 1 with zero existing rows for this campaign_id forces the INSERT.
  SELECT public.fx_submit_response_if_under_ceiling(
    v_probe, 1, NULL, NULL, NULL, '1', NULL, NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, NULL,
    NULL, NULL
  ) INTO v_out;

  IF v_out IS DISTINCT FROM 'inserted' THEN
    RAISE EXCEPTION 'M206 FAILED: INSERT path returned % (expected "inserted")', v_out;
  END IF;

  SELECT pg_catalog.count(*) INTO v_rows FROM public.responses WHERE campaign_id = v_probe;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'M206 FAILED: expected exactly 1 probe row, found %', v_rows;
  END IF;

  -- Remove the probe row. Scoped to this one generated campaign_id, which no
  -- real campaign can collide with.
  DELETE FROM public.responses WHERE campaign_id = v_probe;

  -- And confirm the ceiling branch still short-circuits.
  SELECT public.fx_submit_response_if_under_ceiling(v_probe, 0) INTO v_out;
  IF v_out IS DISTINCT FROM 'ceiling_reached' THEN
    RAISE EXCEPTION 'M206 FAILED: ceiling branch returned % (expected "ceiling_reached")', v_out;
  END IF;

  RAISE NOTICE 'M206 OK: INSERT path inserts, ceiling branch short-circuits, probe row removed.';
END
$assert$;

COMMIT;
