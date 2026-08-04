-- ██ VERIFICATION ONLY — DO NOT APPLY AS A MIGRATION ██
--
-- Run this in the Supabase SQL editor AFTER migration 149 has been applied, to
-- validate BP-01 against the MIGRATION-VALIDATION-CHECKLIST and the ORG-004
-- acceptance points (A Identity preservation, B Referential integrity,
-- C Compatibility, D Authorisation, E Semantic boundary, F Data preservation,
-- G Scope control).
--
-- Every write test is wrapped in BEGIN … ROLLBACK, so this script mutates NO
-- production data — it proves the trigger/FK/CHECK behave, then discards the
-- probe rows. The read-only invariant checks (section 1) touch nothing.
-- Expected results are stated inline. Run the whole file; read the NOTICEs.

-- ── 1. Read-only invariants (A, B, F) ───────────────────────────────────────────

-- A/F: every organisation (live AND soft-deleted) has exactly one subject row,
-- and there are no extra/orphan subject rows. Expect all three counts EQUAL (84).
SELECT
  (SELECT count(*) FROM organisations)                                        AS organisations,
  (SELECT count(*) FROM organisation_subjects)                                AS subjects,
  (SELECT count(*) FROM organisations o
     JOIN organisation_subjects s ON s.subject_id = o.id
     WHERE s.subject_kind = 'organisation')                                   AS matched_org_subjects;

-- A: no organisation lacks a subject row (expect 0 rows).
SELECT o.id FROM organisations o
  LEFT JOIN organisation_subjects s ON s.subject_id = o.id
  WHERE s.subject_id IS NULL;

-- E: no subject row is anything other than an organisation in BP-01
--    (expect 0 — no units/offices exist yet).
SELECT * FROM organisation_subjects WHERE subject_kind <> 'organisation';

-- ── 2. Trigger positive case (C): creating an org auto-registers a subject ──────
-- Explicit BEGIN/ROLLBACK so the probe org never commits (the SQL editor
-- auto-commits bare statements otherwise, which would leave a test row behind).
BEGIN;
DO $$
DECLARE new_id uuid;
BEGIN
  INSERT INTO organisations (name, type)
    VALUES ('__bp01_probe__', 'brand')
    RETURNING id INTO new_id;
  IF NOT EXISTS (SELECT 1 FROM organisation_subjects
                 WHERE subject_id = new_id AND subject_kind = 'organisation') THEN
    RAISE EXCEPTION 'FAIL: new organisation % was not auto-registered as a subject', new_id;
  END IF;
  -- Checklist default check: an insert omitting subject_kind gets 'organisation'.
  IF (SELECT subject_kind FROM organisations WHERE id = new_id) <> 'organisation' THEN
    RAISE EXCEPTION 'FAIL: new organisation % did not default subject_kind to organisation', new_id;
  END IF;
  RAISE NOTICE 'PASS: trigger registered new organisation % as a subject (kind pinned)', new_id;
END $$;
ROLLBACK;  -- discard the probe org + its subject row

-- ── 3. CHECK constraint (E): subject_kind is constrained ────────────────────────
BEGIN;
DO $$
BEGIN
  BEGIN
    INSERT INTO organisation_subjects (subject_id, subject_kind)
      VALUES (gen_random_uuid(), 'not_a_real_kind');
    RAISE EXCEPTION 'FAIL: invalid subject_kind was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: invalid subject_kind rejected by CHECK';
  END;
END $$;
ROLLBACK;

-- ── 4. FK integrity (B): organisations.id must be a registered subject ──────────
-- Prove the FK exists and rejects a dangling org id. We temporarily disable the
-- BEFORE INSERT trigger so the auto-registration doesn't satisfy the FK for us,
-- then confirm the raw insert is refused. The whole transaction is rolled back,
-- so the trigger disable is undone too.
BEGIN;
DO $$
BEGIN
  ALTER TABLE organisations DISABLE TRIGGER organisations_register_subject_trigger;
  BEGIN
    INSERT INTO organisations (id, name, type)
      VALUES ('00000000-0000-0000-0000-0000000000fe', '__bp01_dangling__', 'brand');
    RAISE EXCEPTION 'FAIL: organisation with no subject row was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS: organisation with no registered subject rejected by FK';
  END;
END $$;
ROLLBACK;

-- ── 4b. Cross-kind guard (control-review remediation) (B, E) ────────────────────
-- A uuid already registered under ANOTHER subject kind must not be usable to
-- create an Organisation — the case the single-column FK previously allowed.
BEGIN;
DO $$
DECLARE probe_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO organisation_subjects (subject_id, subject_kind)
    VALUES (probe_id, 'organisation_unit');
  BEGIN
    INSERT INTO organisations (id, name, type)
      VALUES (probe_id, '__bp01_crosskind__', 'brand');
    RAISE EXCEPTION 'FAIL: organisation created over a non-organisation subject uuid';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS: uuid registered as another kind cannot back an organisation';
  END;
END $$;
ROLLBACK;  -- discard the probe unit subject

-- ── 5. Schema-level confirmations (C, E, G) ─────────────────────────────────────
-- The FK is present AND composite — the definition must read
-- FOREIGN KEY (id, subject_kind) REFERENCES organisation_subjects(subject_id, subject_kind),
-- proving the kind is enforced, not just the id.
SELECT conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint WHERE conname = 'organisations_subject_fk';
-- … the trigger is present …
SELECT tgname FROM pg_trigger WHERE tgname = 'organisations_register_subject_trigger';
-- … RLS is on for the new table …
SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'organisation_subjects';
-- … the constant discriminator exists on organisations, defaulted to 'organisation'.
SELECT column_name, column_default FROM information_schema.columns
  WHERE table_name = 'organisations' AND column_name = 'subject_kind';
-- … organisations columns are the original 8 PLUS the deliberate subject_kind
--    discriminator (expect 9; nothing else added).
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'organisations' ORDER BY ordinal_position;
-- G: confirm NO BP-02+ tables were created by this package (expect 0 rows).
SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('organisation_units','organisational_offices','organisation_offices',
                       'organisation_names','organisation_identifiers','organisation_classifications',
                       'organisation_identities','organisation_relationships','organisation_authorities');
