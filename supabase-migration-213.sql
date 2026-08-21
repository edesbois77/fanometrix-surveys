-- Migration 213: revision attribution on evidence
--
-- Status: HAND-APPLY. Additive — four nullable columns, no index, no rewrite.
-- WP1 design refs: M5, M6, M7 · §3.6, §3.7 · criteria 8-11, 68.
--
-- This is what makes an answering session SELF-ATTRIBUTING: it carries the
-- configuration it was served under, so attribution never depends on reading
-- current membership (which may since have changed) nor on the event stream
-- surviving (§13.2).
--
-- `survey_events.survey_id` is stored rather than derived. Deriving it would mean
-- either parsing the slug — banned, and it breaks on rename and soft-delete — or
-- joining through a slug that may no longer resolve. Production already shows the
-- failure mode: 3 survey_events rows reference a campaign slug that resolves to
-- nothing. Those are unattributable today, and any join-based scheme inherits it.
--
-- NO BACKFILL. Historical rows keep NULL and read as "attribution unavailable",
-- never as zero (criterion 78). WP1 Results are per-revision and revisions only
-- exist going forward, so no historical row needs this. New evidence stores
-- survey_id at write time from the server-resolved campaign.
--
-- SIZE: two nullable uuids on survey_events ~= 320 MB at 10M rows (~180 MB at
-- today's 1.14M). Nullable with no default, so the ALTER is metadata-only on
-- Postgres 11+ and does not rewrite the table.
--
-- INDEXES ARE NOT HERE. They are CREATE INDEX CONCURRENTLY, which cannot run in
-- a transaction block, and building them non-concurrently would hold ACCESS
-- EXCLUSIVE on survey_events for a full heap scan — blocking every write for the
-- duration. They live in migration 214.

BEGIN;

DO $preflight$
DECLARE missing text := '';
BEGIN
  IF to_regclass('public.survey_events')    IS NULL THEN missing := missing || E'\n  - survey_events'; END IF;
  IF to_regclass('public.response_answers') IS NULL THEN missing := missing || E'\n  - response_answers'; END IF;
  IF to_regclass('public.responses')        IS NULL THEN missing := missing || E'\n  - responses'; END IF;
  IF to_regclass('public.campaign_group_revisions') IS NULL THEN missing := missing || E'\n  - campaign_group_revisions (migration 210)'; END IF;
  IF missing <> '' THEN
    RAISE EXCEPTION E'M213 PRE-FLIGHT FAILED — missing:%\n\nNothing has been changed.', missing;
  END IF;
  -- Capture the CURRENT access posture so the assertion below can prove this
  -- migration changed nothing, rather than asserting an absolute state that
  -- belongs to migration 205. A database where 205 has not run is still a valid
  -- target for 213; what matters is that 213 does not move the posture.
  CREATE TEMP TABLE _m213_posture ON COMMIT DROP AS
  SELECT t AS tbl,
         has_table_privilege('anon','public.'||t,'SELECT')          AS anon_sel,
         has_table_privilege('authenticated','public.'||t,'SELECT') AS auth_sel,
         (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.'||t)::regclass) AS rls
    FROM unnest(ARRAY['survey_events','response_answers','responses']) t;

  RAISE NOTICE 'M213 pre-flight OK (access posture captured for delta check).';
END
$preflight$;

-- No FK to campaign_group_revisions on purpose: evidence must survive even if a
-- revision row were ever removed, and a per-row FK check on the hottest write
-- path in the system is a cost with no corresponding benefit. The relationship is
-- validated at write time by the application (§7) against frozen rows.
ALTER TABLE public.survey_events
  ADD COLUMN IF NOT EXISTS configuration_revision_id uuid,
  ADD COLUMN IF NOT EXISTS survey_id                 uuid;

ALTER TABLE public.response_answers
  ADD COLUMN IF NOT EXISTS configuration_revision_id uuid;

ALTER TABLE public.responses
  ADD COLUMN IF NOT EXISTS configuration_revision_id uuid;

DO $assert$
DECLARE t text; c text;
BEGIN
  FOREACH t IN ARRAY ARRAY['survey_events','response_answers','responses'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=t
                      AND column_name='configuration_revision_id' AND data_type='uuid'
                      AND is_nullable='YES') THEN
      RAISE EXCEPTION 'M213 FAILED: configuration_revision_id missing or not nullable uuid on %', t;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='survey_events'
                    AND column_name='survey_id' AND data_type='uuid') THEN
    RAISE EXCEPTION 'M213 FAILED: survey_events.survey_id missing';
  END IF;

  -- Nothing existing may have been DISTURBED. Compared against the posture
  -- captured at pre-flight, so this holds on any database regardless of whether
  -- migration 205 has run there.
  SELECT string_agg(p.tbl, ', ') INTO c
    FROM _m213_posture p
   WHERE p.anon_sel IS DISTINCT FROM has_table_privilege('anon','public.'||p.tbl,'SELECT')
      OR p.auth_sel IS DISTINCT FROM has_table_privilege('authenticated','public.'||p.tbl,'SELECT')
      OR p.rls      IS DISTINCT FROM (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.'||p.tbl)::regclass);
  IF c IS NOT NULL THEN
    RAISE EXCEPTION 'M213 FAILED: access posture changed on % — this migration must add columns and nothing else', c;
  END IF;

  RAISE NOTICE 'M213 OK: 4 nullable columns added; % existing survey_events rows untouched and NULL.',
    (SELECT count(*) FROM public.survey_events);
END
$assert$;

COMMIT;
