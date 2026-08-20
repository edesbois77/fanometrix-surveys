-- Rollback for Migration 208.
-- Restores ON DELETE SET NULL, drops the guard and the origin constraints.
-- `origin` itself is LEFT IN PLACE: it is inert once nothing reads it, and
-- dropping it would break any code still referencing it mid-revert.
BEGIN;
DROP TRIGGER IF EXISTS campaigns_identity_guard ON public.campaigns;
DROP FUNCTION IF EXISTS public.fx_campaigns_identity_guard();
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_studio_requires_survey;
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_origin_check;
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_survey_id_fkey;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_survey_id_fkey
  FOREIGN KEY (survey_id) REFERENCES public.surveys(id) ON DELETE SET NULL;
COMMIT;
