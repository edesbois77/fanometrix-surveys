-- Migration 187: Atomic response-ceiling guard for "Stop collecting" campaigns
-- Purpose: make a configured Stop-collecting target a GENUINE hard ceiling, even
--          under concurrent submissions. Without this, /api/submit reads the count
--          then inserts in two steps, so N concurrent completions can each pass the
--          check and overshoot the target (N+1 race).
-- Status: ADDITIVE (new function only; no table/column/data change). PROPOSAL ONLY.
--         Do NOT auto-apply.
--
-- How it works:
--   fx_submit_response_if_under_ceiling(p_campaign_id, p_target, p_payload):
--     1. Takes a per-campaign transaction-scoped advisory lock
--        (pg_advisory_xact_lock keyed on the campaign slug). This serialises ONLY
--        submissions for the same campaign; other campaigns are unaffected.
--     2. Re-counts real (is_demo = false) responses for that campaign INSIDE the lock.
--     3. If the count is already at/above the target, returns 'ceiling_reached'
--        and inserts nothing (the respondent lost the race — handled gracefully by
--        /api/submit, which still returns 200 and lets the fan see the Thank You;
--        their partial answers in response_answers are unaffected).
--     4. Otherwise inserts the response from the JSON payload and returns 'inserted'.
--   The lock is released automatically at transaction end (each PostgREST RPC call
--   is its own transaction), so the count + insert are one atomic unit.
--
-- Payload contract: the caller passes the full response row as JSONB, INCLUDING an
--   'id' (uuid) and 'created_at' (timestamptz) so the defaulted columns are never
--   overwritten with NULL by jsonb_populate_record. Unknown keys are ignored;
--   missing columns become NULL, exactly as the app's explicit insert already does.
--
-- Scope of use: /api/submit routes through this ONLY for stop-mode campaigns that
--   have a target. Every other campaign (no target, or continue-mode, incl. all
--   historical / fan-invitation traffic) keeps using the existing plain INSERT path
--   unchanged, so this function cannot alter their behaviour.

BEGIN;

CREATE OR REPLACE FUNCTION fx_submit_response_if_under_ceiling(
  p_campaign_id text,
  p_target      integer,
  p_payload     jsonb
) RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Serialise concurrent submissions for THIS campaign only.
  PERFORM pg_advisory_xact_lock(hashtext(p_campaign_id));

  SELECT count(*) INTO v_count
    FROM responses
   WHERE campaign_id = p_campaign_id
     AND is_demo = false;

  IF v_count >= p_target THEN
    RETURN 'ceiling_reached';
  END IF;

  INSERT INTO responses
  SELECT * FROM jsonb_populate_record(NULL::responses, p_payload);

  RETURN 'inserted';
END;
$$;

-- The public submit route uses the anon client (same as its current direct insert),
-- so anon/authenticated must be able to execute the guard.
GRANT EXECUTE ON FUNCTION fx_submit_response_if_under_ceiling(text, integer, jsonb)
  TO anon, authenticated;

COMMIT;

-- Verify (after apply):
--   SELECT proname, provolatile FROM pg_proc WHERE proname = 'fx_submit_response_if_under_ceiling';
--   -- Expect one row. Then a concurrency test (see the implementation brief) must
--   -- show completions never exceed the target under parallel submits.
