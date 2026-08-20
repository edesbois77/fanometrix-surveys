-- Rollback for Migration 213.
--
-- READ THIS FIRST. Once ANY production row carries a configuration_revision_id,
-- dropping these columns destroys attribution that cannot be reconstructed —
-- there is no other record of which configuration served a given session.
--
-- After evidence exists, ROLLBACK MEANS DISABLING THE FEATURE FLAG AND REVERTING
-- CODE, NOT DROPPING THESE COLUMNS. They are nullable and completely inert when
-- nothing writes them.
--
-- This script therefore REFUSES while any row carries a revision. That refusal is
-- the point; it is not an obstacle to work around.
BEGIN;
DO $guard$
DECLARE n bigint;
BEGIN
  SELECT (SELECT count(*) FROM public.survey_events    WHERE configuration_revision_id IS NOT NULL)
       + (SELECT count(*) FROM public.response_answers WHERE configuration_revision_id IS NOT NULL)
       + (SELECT count(*) FROM public.responses        WHERE configuration_revision_id IS NOT NULL)
    INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION
      'M213 ROLLBACK REFUSED: % evidence rows already carry a configuration_revision_id. Dropping these columns would destroy attribution permanently. Disable the feature flag and revert the code instead; the columns are inert when unused.', n;
  END IF;
END
$guard$;
ALTER TABLE public.responses        DROP COLUMN IF EXISTS configuration_revision_id;
ALTER TABLE public.response_answers DROP COLUMN IF EXISTS configuration_revision_id;
ALTER TABLE public.survey_events    DROP COLUMN IF EXISTS survey_id;
ALTER TABLE public.survey_events    DROP COLUMN IF EXISTS configuration_revision_id;
COMMIT;
