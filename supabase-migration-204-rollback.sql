-- Rollback for Migration 204 (additive typed completion RPC)
--
-- Migration 204 only ADDED a function; it changed no policy, grant or data, and
-- the old (text, integer, jsonb) signature was left untouched beside it. So this
-- rollback simply removes what 204 added.
--
-- Safe to run ONLY while no deployed code calls the typed signature. If the
-- application commit that calls it is live, revert that commit first.

BEGIN;

DROP FUNCTION IF EXISTS public.fx_submit_response_if_under_ceiling(
  text, integer, uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, integer, boolean, text, text,
  text, text
);

COMMIT;
