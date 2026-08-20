-- Rollback for Migration 205 (P0 exposure lockdown)
--
-- Restores the pre-205 policy, grant and function state VERBATIM, as captured
-- from production pg_policies / pg_proc on 2026-08-20 before any change.
--
-- IMPORTANT: applying this re-opens anonymous read access to responses,
-- surveys, campaigns, campaign_groups, campaign_group_members and the five
-- views, and re-opens anonymous INSERT/UPDATE/DELETE on surveys and campaigns.
-- It is a break-glass action, not a routine one.
--
-- If a ROUTE breaks after 205, the correct fix is to move that route to the
-- service role — not to run this. Re-opening a policy restores the exposure for
-- every caller on the internet, not just the broken route.
--
-- NO CODE COUPLING: the typed RPC added by migration 204 is NOT touched here, so
-- /api/submit keeps working whether or not this rollback is applied. That is the
-- reason the remediation was split into 204 and 205.

BEGIN;

-- 1. Restore the untyped jsonb completion RPC (migration 187 definition, verbatim)
CREATE OR REPLACE FUNCTION public.fx_submit_response_if_under_ceiling(
  p_campaign_id text,
  p_target      integer,
  p_payload     jsonb
) RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
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

GRANT EXECUTE ON FUNCTION public.fx_submit_response_if_under_ceiling(text, integer, jsonb)
  TO PUBLIC, anon, authenticated, service_role;

-- 2. Restore anon EXECUTE on the other functions
DO $restore$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'dashboard_event_counts','dashboard_event_series','dashboard_answer_series',
         'claim_next_job','renew_job_lease','rollup_events_hourly',
         'rollup_events_daily','create_organisation_relationship'
       )
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END
$restore$;

ALTER FUNCTION public.enforce_campaign_project_provenance() SET search_path = public;

-- 3. Restore view grants
GRANT SELECT ON public.vw_campaign_responses        TO anon, authenticated;
GRANT SELECT ON public.vw_campaign_stats            TO anon, authenticated;
GRANT SELECT ON public.vw_survey_stats              TO anon, authenticated;
GRANT SELECT ON public.vw_research_project_stats    TO anon, authenticated;
GRANT SELECT ON public.vw_conversation_search_stats TO anon, authenticated;

-- 4. Restore the permissive policies exactly as captured
DROP POLICY IF EXISTS deny_all_anon ON public.responses;
CREATE POLICY "Anyone can read"             ON public.responses FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert"           ON public.responses FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can delete demo rows" ON public.responses FOR DELETE TO public USING (is_demo = true);

DROP POLICY IF EXISTS deny_all_anon ON public.surveys;
CREATE POLICY "Anyone can read surveys"   ON public.surveys FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert surveys" ON public.surveys FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update surveys" ON public.surveys FOR UPDATE TO public USING (true);
CREATE POLICY "Anyone can delete surveys" ON public.surveys FOR DELETE TO public USING (true);

DROP POLICY IF EXISTS deny_all_anon ON public.campaigns;
CREATE POLICY "Anyone can read campaigns"   ON public.campaigns FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert campaigns" ON public.campaigns FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update campaigns" ON public.campaigns FOR UPDATE TO public USING (true);
CREATE POLICY "Anyone can delete campaigns" ON public.campaigns FOR DELETE TO public USING (true);

DROP POLICY IF EXISTS deny_all_anon ON public.campaign_groups;
CREATE POLICY "Anyone can read campaign_groups" ON public.campaign_groups FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS deny_all_anon ON public.campaign_group_members;
CREATE POLICY "Anyone can read campaign_group_members" ON public.campaign_group_members FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS deny_all_anon ON public.survey_events;
CREATE POLICY events_insert_anon          ON public.survey_events FOR INSERT TO anon          WITH CHECK (true);
CREATE POLICY events_select_authenticated ON public.survey_events FOR SELECT TO authenticated USING (true);

COMMIT;
