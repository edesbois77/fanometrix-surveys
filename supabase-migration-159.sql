-- Migration 159 - ORG-004 BP-04 / F-3 (control-approved): admit 'organisational_office'
-- to the closed BP-02/BP-03 subject_kind CHECKs
--
-- PHASE A - PROPOSED, NOT YET APPLIED. Awaiting migration control review.
--
-- Controlled ADDITIVE evolution (NOT a redesign of BP-02/BP-03), authorised by control
-- determination F-3. Required by R06:
--   FR-002 - an Organisational Office is the subject of authorised canonical facts
--            (Names, Identifiers, Classifications).
--   FR-017 - the Office participant in an office-holding Relationship references an
--            already-established Office (i.e. Office must be admissible as a relationship
--            participant, which BP-03 deliberately anticipated).
--
-- Each widening only ADDS 'organisational_office' to the permitted set. Existing accepted
-- kinds ('organisation','organisation_unit'), existing rows, constraints and semantics are
-- preserved. No data is modified. The widening is name-agnostic (it introspects and replaces
-- the existing inline subject_kind CHECK), idempotent, and reversible.

DO $$
DECLARE tbl text; cn text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'organisation_names',
    'organisation_identifiers',
    'classification_assignments',
    'organisation_relationship_participants'
  ] LOOP
    -- Drop the existing subject_kind CHECK (whatever its auto-generated name).
    FOR cn IN
      SELECT conname FROM pg_constraint
      WHERE conrelid = ('public.' || tbl)::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%subject_kind%'
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', tbl, cn);
    END LOOP;
    -- Add the widened, explicitly-named constraint.
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (subject_kind IN (''organisation'',''organisation_unit'',''organisational_office''))',
      tbl, tbl || '_subject_kind_check');
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- -- Rollback --------------------------------------------------------------------
-- Restore the original two-kind CHECKs (only safe if no 'organisational_office' rows exist).
--   DO $$
--   DECLARE tbl text; cn text;
--   BEGIN
--     FOREACH tbl IN ARRAY ARRAY['organisation_names','organisation_identifiers','classification_assignments','organisation_relationship_participants'] LOOP
--       FOR cn IN SELECT conname FROM pg_constraint WHERE conrelid=('public.'||tbl)::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%subject_kind%'
--       LOOP EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', tbl, cn); END LOOP;
--       EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (subject_kind IN (''organisation'',''organisation_unit''))', tbl, tbl||'_subject_kind_check');
--     END LOOP;
--   END $$;
