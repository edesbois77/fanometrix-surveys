-- Migration 209: campaign_groups gains a Studio owner model
--
-- Status: HAND-APPLY. Additive — three columns, no legacy row changes meaning.
-- WP1 design refs: M1 · §3.1.
--
-- SHARED ROOT TABLE, DELIBERATELY
-- `campaign_groups` already holds legacy Research Project groups and will now
-- also hold Survey Studio groups, discriminated by `owner_model`. The legacy
-- MEMBERSHIP table `campaign_group_members` is NOT touched by WP1 at all —
-- Studio membership lives in its own revision tables.
--
-- Three existing routes read `select("*")` from this table and will see three
-- additional keys. They are additive, so nothing is lost; the release ships with
-- a payload-shape test for each.
--
-- Defaulting is not sufficient on its own: every legacy query is also updated to
-- FILTER on owner_model, so a Studio group can never appear in a legacy list even
-- if this backfill is later disturbed by hand.

BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.campaign_groups') IS NULL THEN
    RAISE EXCEPTION 'M209 PRE-FLIGHT FAILED: public.campaign_groups does not exist. Nothing changed.';
  END IF;
  RAISE NOTICE 'M209 pre-flight OK: % existing groups.', (SELECT count(*) FROM public.campaign_groups);
END
$preflight$;

ALTER TABLE public.campaign_groups
  ADD COLUMN IF NOT EXISTS organisation_id uuid,
  ADD COLUMN IF NOT EXISTS owner_model     text NOT NULL DEFAULT 'research_project',
  ADD COLUMN IF NOT EXISTS fail_mode       text NOT NULL DEFAULT 'open';

ALTER TABLE public.campaign_groups DROP CONSTRAINT IF EXISTS campaign_groups_owner_model_check;
ALTER TABLE public.campaign_groups ADD CONSTRAINT campaign_groups_owner_model_check
  CHECK (owner_model IN ('research_project','survey_studio'));

-- Legacy eligibility fails OPEN today (§1.5). That behaviour is preserved for
-- existing groups rather than silently changed; Studio groups are created with
-- 'closed' and the new serve path enforces it.
ALTER TABLE public.campaign_groups DROP CONSTRAINT IF EXISTS campaign_groups_fail_mode_check;
ALTER TABLE public.campaign_groups ADD CONSTRAINT campaign_groups_fail_mode_check
  CHECK (fail_mode IN ('open','closed'));

-- A Studio group must be owned by an organisation; a legacy group must not gain one here.
ALTER TABLE public.campaign_groups DROP CONSTRAINT IF EXISTS campaign_groups_studio_requires_org;
ALTER TABLE public.campaign_groups ADD CONSTRAINT campaign_groups_studio_requires_org
  CHECK (owner_model <> 'survey_studio' OR organisation_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_campaign_groups_owner_model
  ON public.campaign_groups (owner_model);

DO $assert$
BEGIN
  IF EXISTS (SELECT 1 FROM public.campaign_groups WHERE owner_model <> 'research_project') THEN
    RAISE EXCEPTION 'M209 FAILED: an existing group is not research_project after backfill';
  END IF;
  IF EXISTS (SELECT 1 FROM public.campaign_groups WHERE fail_mode <> 'open') THEN
    RAISE EXCEPTION 'M209 FAILED: an existing group changed fail_mode — legacy behaviour must be preserved';
  END IF;
  RAISE NOTICE 'M209 OK: % legacy groups all owner_model=research_project, fail_mode=open (unchanged).',
    (SELECT count(*) FROM public.campaign_groups);
END
$assert$;

COMMIT;
