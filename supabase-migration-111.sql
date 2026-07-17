-- Migration 111: Null out unreplaced ad-server macros stored on responses.
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- When a publisher's ad server doesn't substitute a macro, the literal token
-- (e.g. %%COUNTRY%%, ${SITE}, {{cb}}, [ZONE], __POS__, %country%) flows through
-- the embed URL and gets stored as a bogus dimension value — which then shows up
-- as its own bar in the dashboard's By Country / By Publisher / etc. charts.
--
-- /api/submit now strips these at ingestion (lib/normalise.stripAdMacro), so no
-- new rows are affected. This backfill clears the ones already stored, setting
-- any wholly-placeholder dimension value to NULL (unknown), matching the app's
-- regex. IDEMPOTENT: it only rewrites values that still match the macro shape,
-- so a second run changes nothing. No schema change.

DO $$
DECLARE
  col text;
  -- Mirror of AD_MACRO_RE in lib/normalise.ts.
  pat text := '^\s*(%%.*%%|%[A-Za-z0-9_.]+%|\$\{.*\}|\{.*\}|\[.*\]|__.+__)\s*$';
BEGIN
  FOREACH col IN ARRAY ARRAY[
    'country', 'country_code', 'publisher', 'placement', 'placement_id',
    'creative_id', 'club', 'competition', 'device', 'browser', 'market', 'fan_segment'
  ]
  LOOP
    EXECUTE format('UPDATE responses SET %I = NULL WHERE %I ~ $1', col, col) USING pat;
  END LOOP;
END $$;

-- Verify (optional) — should return no rows:
--   SELECT id, country, publisher, placement, market
--   FROM responses
--   WHERE country      ~ '^\s*(%%.*%%|%[A-Za-z0-9_.]+%|\$\{.*\}|\{.*\}|\[.*\]|__.+__)\s*$'
--      OR publisher    ~ '^\s*(%%.*%%|%[A-Za-z0-9_.]+%|\$\{.*\}|\{.*\}|\[.*\]|__.+__)\s*$'
--      OR placement    ~ '^\s*(%%.*%%|%[A-Za-z0-9_.]+%|\$\{.*\}|\{.*\}|\[.*\]|__.+__)\s*$'
--      OR market       ~ '^\s*(%%.*%%|%[A-Za-z0-9_.]+%|\$\{.*\}|\{.*\}|\[.*\]|__.+__)\s*$';
--
-- Rollback: none — this only clears placeholder tokens that were never valid data.
