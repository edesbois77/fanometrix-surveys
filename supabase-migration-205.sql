-- Migration 205: P0 Supabase exposure remediation — LOCKDOWN
--
-- Status: HAND-APPLY. Do NOT auto-apply. Apply ONLY after migration 204 AND the
--         matching application deploy are both live and verified. Every route
--         that depended on the permissive policies dropped here has been
--         converted to the service role, which bypasses RLS, so the code must
--         land first or the public survey path breaks.
--
-- Context: an anonymous read-only probe with the public anon key confirmed that
-- `responses`, `surveys`, `campaigns`, `campaign_groups`, `campaign_group_members`,
-- `vw_campaign_responses` and `vw_survey_stats` all returned rows. Mutation
-- exposure on `surveys` and `campaigns` was inferred from grants and policies and
-- deliberately NOT tested against production.
--
-- Reversal: supabase-migration-205-rollback.sql restores the prior state verbatim.
--
-- Each numbered section below is independently reversible. If a route breaks,
-- the fix is to move that route to the service role — NOT to re-open a policy.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- PRE-FLIGHT ASSERTION
--
-- Every object this migration locks down must exist. If one is missing, FAIL
-- LOUDLY and name it, rather than skipping it.
--
-- The tempting alternative — "revoke only what exists" — is wrong for a security
-- migration: it would report success while leaving a table wide open, and you
-- would believe you had locked down something you had not. A dry run against a
-- database missing `responses` and four of the five views is what surfaced this;
-- the whole point is that such a database must NOT quietly get a partial
-- lockdown.
--
-- Everything below runs in ONE transaction, so a failure here leaves the
-- database exactly as it was.
-- ─────────────────────────────────────────────────────────────────────────────
DO $preflight$
DECLARE
  missing text := '';
  o text;
BEGIN
  FOREACH o IN ARRAY ARRAY[
    'responses', 'surveys', 'campaigns', 'campaign_groups',
    'campaign_group_members', 'survey_events',
    'vw_campaign_responses', 'vw_campaign_stats', 'vw_survey_stats',
    'vw_research_project_stats', 'vw_conversation_search_stats'
  ] LOOP
    IF to_regclass('public.' || o) IS NULL THEN
      missing := missing || E'\n  - ' || o;
    END IF;
  END LOOP;

  IF missing <> '' THEN
    RAISE EXCEPTION
      E'M205 PRE-FLIGHT FAILED — these objects do not exist, so the lockdown would be INCOMPLETE:%\n\nNothing has been changed. Resolve the drift, then re-run.', missing;
  END IF;

  RAISE NOTICE 'M205 pre-flight OK: all 6 tables and all 5 views present.';
END
$preflight$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Retire the untyped completion RPC
--
-- The old signature inserted with:
--     INSERT INTO responses SELECT * FROM jsonb_populate_record(NULL::responses, p_payload)
-- which handed the caller control of EVERY column on `responses`, including
-- `is_demo` and `evidence_simulation_id` — the simulation-provenance link. It was
-- SECURITY INVOKER with no search_path and EXECUTE granted to anon, so an
-- anonymous caller could write arbitrary response rows, bypassing the
-- campaign-live, not-simulated and validation checks in /api/submit entirely.
--
-- Migration 204 added the typed replacement. By the time this runs, /api/submit
-- is already calling it, so nothing references this signature.
DROP FUNCTION IF EXISTS public.fx_submit_response_if_under_ceiling(text, integer, jsonb);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Remaining anon-executable functions
--
-- None of these is reachable from the public survey path. The dashboard_*
-- functions already return nothing to anon (no SELECT policy on survey_events),
-- but an executable function is a surface regardless of what it currently
-- returns; claim_next_job / renew_job_lease would let an anonymous caller
-- interfere with the jobs queue, and the rollup_* functions are unbounded
-- compute.
-- Revoked by NAME rather than by signature: several of these have argument
-- lists that differ from what the calling code suggests (claim_next_job takes a
-- p_types text[] third argument, dashboard_event_counts takes eight), and
-- guessing a signature produces a REVOKE that silently targets nothing. This
-- loop covers every overload of every listed name.
DO $revoke$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'dashboard_event_counts',
         'dashboard_event_series',
         'dashboard_answer_series',
         'claim_next_job',
         'renew_job_lease',
         'rollup_events_hourly',
         'rollup_events_daily',
         'create_organisation_relationship'
       )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END
$revoke$;

-- The one SECURITY DEFINER function. It is a trigger function, so it is not
-- callable through PostgREST, but its search_path was `public` alone — pin it so
-- an unqualified reference can never resolve outside pg_catalog/public.
ALTER FUNCTION public.enforce_campaign_project_provenance() SET search_path = pg_catalog, public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Views
--
-- All five are owned by `postgres` and carry no security_invoker, so they run
-- with OWNER privileges and bypass RLS on their underlying tables entirely.
-- vw_campaign_responses is the most sensitive object in the database reachable
-- this way: per-response q1/q2/q3 with country, publisher, placement, device and
-- duration. Fixing the table policies in section 4 does NOT close these — a view
-- is not protected by the RLS of its sources — so the grant itself must go.
--
-- Every consumer is now a service-role read, which is unaffected by these
-- revokes (service_role holds its own grant).
REVOKE ALL ON public.vw_campaign_responses        FROM anon, authenticated;
REVOKE ALL ON public.vw_campaign_stats            FROM anon, authenticated;
REVOKE ALL ON public.vw_survey_stats              FROM anon, authenticated;
REVOKE ALL ON public.vw_research_project_stats    FROM anon, authenticated;
REVOKE ALL ON public.vw_conversation_search_stats FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Table policies
--
-- Note on the `cmd = 'ALL'` deny pattern: when a policy omits WITH CHECK,
-- Postgres reuses the USING expression for INSERT/UPDATE checks, so a single
-- `USING (false)` policy denies every command. This is the pattern already in
-- place on response_answers and submission_logs; these tables now match it.

-- responses — respondent research evidence
DROP POLICY IF EXISTS "Anyone can read"            ON public.responses;
DROP POLICY IF EXISTS "Anyone can insert"          ON public.responses;
DROP POLICY IF EXISTS "Anyone can delete demo rows" ON public.responses;
CREATE POLICY deny_all_anon ON public.responses FOR ALL TO public USING (false);

-- surveys — the client research instrument. Anonymous UPDATE here meant the
-- questions of a LIVE survey could be altered mid-fieldwork, which is a
-- research-integrity risk, not only a confidentiality one.
DROP POLICY IF EXISTS "Anyone can read surveys"   ON public.surveys;
DROP POLICY IF EXISTS "Anyone can insert surveys" ON public.surveys;
DROP POLICY IF EXISTS "Anyone can update surveys" ON public.surveys;
DROP POLICY IF EXISTS "Anyone can delete surveys" ON public.surveys;
CREATE POLICY deny_all_anon ON public.surveys FOR ALL TO public USING (false);

-- campaigns — delivery configuration
DROP POLICY IF EXISTS "Anyone can read campaigns"   ON public.campaigns;
DROP POLICY IF EXISTS "Anyone can insert campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Anyone can update campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Anyone can delete campaigns" ON public.campaigns;
CREATE POLICY deny_all_anon ON public.campaigns FOR ALL TO public USING (false);

-- campaign_groups / campaign_group_members — delivery configuration
DROP POLICY IF EXISTS "Anyone can read campaign_groups" ON public.campaign_groups;
CREATE POLICY deny_all_anon ON public.campaign_groups FOR ALL TO public USING (false);

DROP POLICY IF EXISTS "Anyone can read campaign_group_members" ON public.campaign_group_members;
CREATE POLICY deny_all_anon ON public.campaign_group_members FOR ALL TO public USING (false);

-- survey_events — telemetry. The anon INSERT policy was the legitimate path for
-- POST /api/events; that route now writes with the service role, so the policy
-- is no longer needed. events_select_authenticated is dropped as dead surface:
-- the app uses its own session auth, never Supabase Auth, so no principal ever
-- holds the `authenticated` role.
DROP POLICY IF EXISTS events_insert_anon           ON public.survey_events;
DROP POLICY IF EXISTS events_select_authenticated  ON public.survey_events;
CREATE POLICY deny_all_anon ON public.survey_events FOR ALL TO public USING (false);

COMMIT;
