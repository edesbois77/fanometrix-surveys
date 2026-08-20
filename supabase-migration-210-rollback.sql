-- Rollback for Migration 210. Drops both revision tables.
-- Refuses if any evidence already references a revision — dropping then would
-- orphan attribution that cannot be reconstructed.
BEGIN;
DO $guard$
DECLARE v_referenced boolean := false;
BEGIN
  -- The column reference MUST be dynamic. plpgsql resolves identifiers when the
  -- statement executes, and it plans the whole boolean expression as one unit —
  -- an `AND` does not stop the second operand being resolved. So the obvious
  -- form, `IF <column exists> AND EXISTS (SELECT ... WHERE configuration_revision_id ...)`,
  -- fails with "column does not exist" whenever migration 213 has already been
  -- rolled back, which is exactly the reverse order the runbook prescribes.
  -- Found by re-running the rollback chain from a clean state, not by review.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='survey_events'
                AND column_name='configuration_revision_id') THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.survey_events WHERE configuration_revision_id IS NOT NULL)'
      INTO v_referenced;
  END IF;

  IF v_referenced THEN
    RAISE EXCEPTION 'M210 ROLLBACK REFUSED: survey_events already reference configuration revisions. Disable the feature instead of dropping the tables.';
  END IF;
END
$guard$;
DROP TABLE IF EXISTS public.campaign_group_revision_members;
DROP TABLE IF EXISTS public.campaign_group_revisions;
COMMIT;
