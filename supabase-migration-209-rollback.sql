-- Rollback for Migration 209. Safe while no Studio group exists.
BEGIN;
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.campaign_groups WHERE owner_model = 'survey_studio') THEN
    RAISE EXCEPTION 'M209 ROLLBACK REFUSED: Studio groups exist. Dropping owner_model would make them indistinguishable from legacy groups and they would appear in legacy lists. Remove the Studio groups first.';
  END IF;
END
$guard$;
ALTER TABLE public.campaign_groups DROP CONSTRAINT IF EXISTS campaign_groups_studio_requires_org;
ALTER TABLE public.campaign_groups DROP CONSTRAINT IF EXISTS campaign_groups_fail_mode_check;
ALTER TABLE public.campaign_groups DROP CONSTRAINT IF EXISTS campaign_groups_owner_model_check;
DROP INDEX IF EXISTS public.idx_campaign_groups_owner_model;
ALTER TABLE public.campaign_groups
  DROP COLUMN IF EXISTS fail_mode,
  DROP COLUMN IF EXISTS owner_model,
  DROP COLUMN IF EXISTS organisation_id;
COMMIT;
