-- Rollback for Migration 210. Drops both revision tables.
-- Refuses if any evidence already references a revision — dropping then would
-- orphan attribution that cannot be reconstructed.
BEGIN;
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='survey_events'
                AND column_name='configuration_revision_id')
     AND EXISTS (SELECT 1 FROM public.survey_events WHERE configuration_revision_id IS NOT NULL) THEN
    RAISE EXCEPTION 'M210 ROLLBACK REFUSED: survey_events already reference configuration revisions. Disable the feature instead of dropping the tables.';
  END IF;
END
$guard$;
DROP TABLE IF EXISTS public.campaign_group_revision_members;
DROP TABLE IF EXISTS public.campaign_group_revisions;
COMMIT;
