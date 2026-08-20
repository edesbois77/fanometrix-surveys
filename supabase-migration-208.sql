-- Migration 208: campaign identity — origin, immutability, referential safety
--
-- Status: HAND-APPLY. Additive except for one deliberate FK tightening (§3 below).
-- WP1 design refs: M9, M10, M11 · §3.9 · criteria 62-67, 73, 74, 77.
--
-- WHY
-- Studio campaigns are currently identified by a slug PREFIX — `like('campaign_id',
-- 'studio_%')` in 11 places. A prefix is a label, not a relationship: it breaks on
-- rename, it invites parsing a survey id out of the slug (`hex8(surveyId)`), and it
-- cannot be enforced. This replaces it with a real column, and makes the two
-- identity-bearing columns immutable so they are safe to key evidence on.

BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.campaigns') IS NULL THEN
    RAISE EXCEPTION 'M208 PRE-FLIGHT FAILED: public.campaigns does not exist. Nothing changed.';
  END IF;
  IF to_regclass('public.surveys') IS NULL THEN
    RAISE EXCEPTION 'M208 PRE-FLIGHT FAILED: public.surveys does not exist. Nothing changed.';
  END IF;
  RAISE NOTICE 'M208 pre-flight OK.';
END
$preflight$;

-- ── 1. origin ────────────────────────────────────────────────────────────────
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'legacy';

-- Backfill BEFORE the CHECK, so the constraint validates against real data.
--   survey_studio    : the Studio slug prefix, the only signal that exists today
--   research_project : attached to a project
--   legacy           : everything else
UPDATE public.campaigns SET origin = 'survey_studio'
 WHERE origin = 'legacy' AND campaign_id LIKE 'studio\_%';
UPDATE public.campaigns SET origin = 'research_project'
 WHERE origin = 'legacy' AND research_project_id IS NOT NULL;

ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_origin_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_origin_check
  CHECK (origin IN ('survey_studio','research_project','legacy'));

-- A Studio campaign without a survey is meaningless — it cannot serve anything.
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_studio_requires_survey;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_studio_requires_survey
  CHECK (origin <> 'survey_studio' OR survey_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_campaigns_origin ON public.campaigns (origin);

-- ── 2. Immutability ──────────────────────────────────────────────────────────
-- `campaign_id` is the key 1.1M survey_events rows are already written against,
-- so it must never move. `survey_id` may be corrected while a campaign has not
-- served; once evidence exists, changing it would silently re-attribute history.
CREATE OR REPLACE FUNCTION public.fx_campaigns_identity_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $guard$
DECLARE
  v_served boolean;
BEGIN
  IF NEW.campaign_id IS DISTINCT FROM OLD.campaign_id THEN
    RAISE EXCEPTION
      'campaigns.campaign_id is immutable (% -> %). Evidence is keyed on this slug; renaming it would orphan history.',
      OLD.campaign_id, NEW.campaign_id;
  END IF;

  IF NEW.survey_id IS DISTINCT FROM OLD.survey_id THEN
    SELECT EXISTS (SELECT 1 FROM public.survey_events   WHERE campaign_id = OLD.campaign_id)
        OR EXISTS (SELECT 1 FROM public.responses       WHERE campaign_id = OLD.campaign_id)
        OR EXISTS (SELECT 1 FROM public.response_answers WHERE campaign_id = OLD.campaign_id)
      INTO v_served;
    IF v_served THEN
      RAISE EXCEPTION
        'campaigns.survey_id cannot change once the campaign has served (campaign %). Existing evidence would be silently re-attributed.',
        OLD.campaign_id;
    END IF;
  END IF;

  RETURN NEW;
END
$guard$;

DROP TRIGGER IF EXISTS campaigns_identity_guard ON public.campaigns;
CREATE TRIGGER campaigns_identity_guard
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.fx_campaigns_identity_guard();

REVOKE ALL ON FUNCTION public.fx_campaigns_identity_guard() FROM PUBLIC, anon, authenticated;

-- ── 3. Referential safety ────────────────────────────────────────────────────
-- ON DELETE SET NULL silently severs a campaign from its survey when a survey is
-- hard-deleted, leaving evidence that can never be re-attributed. RESTRICT makes
-- the deletion refuse instead.
--
-- BEHAVIOUR CHANGE, deliberate and audited: app/api/surveys/[id]/route.ts
-- DELETE ?permanent=1 (admin only, survey must already be soft-deleted) relies on
-- the current severance. That route is updated in the same release to check for
-- referencing campaigns and report clearly, rather than surfacing a raw FK error.
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_survey_id_fkey;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_survey_id_fkey
  FOREIGN KEY (survey_id) REFERENCES public.surveys(id) ON DELETE RESTRICT;

-- ── Self-assertion ───────────────────────────────────────────────────────────
DO $assert$
DECLARE v_fk text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='campaigns' AND column_name='origin') THEN
    RAISE EXCEPTION 'M208 FAILED: campaigns.origin missing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.campaigns WHERE origin NOT IN ('survey_studio','research_project','legacy')) THEN
    RAISE EXCEPTION 'M208 FAILED: rows with an invalid origin';
  END IF;
  IF EXISTS (SELECT 1 FROM public.campaigns WHERE origin='survey_studio' AND survey_id IS NULL) THEN
    RAISE EXCEPTION 'M208 FAILED: a survey_studio campaign has no survey_id';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.campaigns'::regclass AND tgname='campaigns_identity_guard') THEN
    RAISE EXCEPTION 'M208 FAILED: identity guard trigger missing';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO v_fk FROM pg_constraint WHERE conname='campaigns_survey_id_fkey';
  IF v_fk NOT LIKE '%ON DELETE RESTRICT%' THEN
    RAISE EXCEPTION 'M208 FAILED: survey FK is % (expected ON DELETE RESTRICT)', v_fk;
  END IF;
  RAISE NOTICE 'M208 OK: origin backfilled (studio=%, project=%, legacy=%), guard active, FK RESTRICT.',
    (SELECT count(*) FROM public.campaigns WHERE origin='survey_studio'),
    (SELECT count(*) FROM public.campaigns WHERE origin='research_project'),
    (SELECT count(*) FROM public.campaigns WHERE origin='legacy');
END
$assert$;

COMMIT;
