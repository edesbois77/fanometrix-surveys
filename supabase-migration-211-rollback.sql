-- Rollback for Migration 211. Removes the freeze triggers.
-- WARNING: effective configurations become editable again, so a configuration
-- that governed a serve could be silently rewritten. Only roll this back while
-- no group has served.
BEGIN;
DROP TRIGGER IF EXISTS cgr_freeze_effective  ON public.campaign_group_revisions;
DROP TRIGGER IF EXISTS cgrm_freeze_effective ON public.campaign_group_revision_members;
DROP FUNCTION IF EXISTS public.fx_cgr_freeze_effective();
DROP FUNCTION IF EXISTS public.fx_cgrm_freeze_effective();
COMMIT;
