-- === ORG-004 BP-04 PRODUCTION VERIFICATION - VERIFICATION ONLY, NOT A MIGRATION ===
--
-- Covers migrations 158-160 and BP-01..BP-04 regression. SAFE FOR PRODUCTION: every
-- write/probe is wrapped in BEGIN ... ROLLBACK and leaves NO data behind. Negative tests
-- catch the ACTUAL SQLSTATE (raise_exception=P0001; check_violation; foreign_key_violation;
-- unique_violation); genuine unexpected errors still abort. Read the NOTICEs and result rows.

-- ================================================================================
-- SECTION 0 - BP-01..BP-04 regression + data preservation (read-only)
-- ================================================================================
SELECT
  (SELECT count(*) FROM organisations)                                                        AS organisations,          -- expect 84
  (SELECT count(*) FROM organisation_subjects WHERE subject_kind='organisation')              AS org_subjects,            -- expect 84
  (SELECT count(*) FROM organisation_names WHERE subject_kind='organisation' AND is_primary AND deleted_at IS NULL) AS primary_names, -- expect 84
  (SELECT count(*) FROM classification_assignments WHERE effective_to IS NULL AND deleted_at IS NULL) AS current_assignments, -- expect 82
  (SELECT count(*) FROM organisations WHERE type='internal')                                  AS internal_orgs;           -- expect 2

-- BP-04 objects present (expect all non-null / true).
SELECT to_regclass('public.organisation_offices')            AS offices,
       to_regclass('public.organisation_office_attachments') AS attachments;

-- Relationship types now include office_holding (expect 3: membership, lineage_predecessor_successor, office_holding).
SELECT key, is_system FROM relationship_types ORDER BY key;

-- subject_kind CHECKs widened to admit organisational_office (expect 4 rows, each definition lists all three kinds).
SELECT conrelid::regclass::text AS tbl, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
  WHERE contype='c' AND conname LIKE '%subject_kind_check'
    AND conrelid::regclass::text IN ('organisation_names','organisation_identifiers','classification_assignments','organisation_relationship_participants')
  ORDER BY tbl;

-- SCOPE: no BP-05 / Authority structures (expect 0 rows).
SELECT table_name FROM information_schema.tables WHERE table_schema='public'
  AND table_name IN ('organisation_authorities','organisational_authorities','office_holdings');

-- ================================================================================
-- SECTION 1 - Organisational Office subject: creation, registry admission, applicability
-- ================================================================================
BEGIN;
DO $$
DECLARE off1 uuid; k text;
BEGIN
  INSERT INTO organisation_offices (title) VALUES ('__office_A__') RETURNING id INTO off1;
  SELECT subject_kind INTO k FROM organisation_subjects WHERE subject_id=off1;
  IF k <> 'organisational_office' THEN RAISE EXCEPTION 'FAIL: office not registered as organisational_office subject (got %)', k; END IF;
  RAISE NOTICE 'PASS: Office created and admitted to the IC-01 subject registry (FR-001)';

  -- Office existence applicability: zero-length rejected (FR-007, half-open)
  BEGIN
    INSERT INTO organisation_offices (title, effective_from, effective_to) VALUES ('__bad__', DATE '2024-01-01', DATE '2024-01-01');
    RAISE EXCEPTION 'FAIL: zero-length office interval accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: zero-length office applicability rejected (FR-007)'; END;
END $$;
ROLLBACK;

-- ================================================================================
-- SECTION 2 - Structural attachment (FR-010/011/012/013/014/015)
-- ================================================================================
BEGIN;
DO $$
DECLARE org1 uuid; org2 uuid; off1 uuid; unit1 uuid; unit2 uuid;
BEGIN
  SELECT id INTO org1 FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  SELECT id INTO org2 FROM organisations WHERE deleted_at IS NULL AND id<>org1 LIMIT 1;
  INSERT INTO organisation_offices (title) VALUES ('__office_attach__') RETURNING id INTO off1;

  -- Direct attachment to the governing Organisation (no Unit) (FR-011)
  INSERT INTO organisation_office_attachments (office_id, governing_organisation_id) VALUES (off1, org1);
  RAISE NOTICE 'PASS: direct Office attachment to governing Organisation (FR-010/011)';

  -- Unit-mediated attachment where the Unit belongs to the governing Organisation (FR-011/012)
  INSERT INTO organisation_units (organisation_id, name) VALUES (org1, '__unit_in_org1__') RETURNING id INTO unit1;
  INSERT INTO organisation_office_attachments (office_id, governing_organisation_id, organisation_unit_id) VALUES (off1, org1, unit1);
  RAISE NOTICE 'PASS: Unit-mediated Office attachment within governing Organisation (FR-011/012)';

  -- A Unit that does NOT belong to the governing Organisation is rejected (FR-012)
  INSERT INTO organisation_units (organisation_id, name) VALUES (org2, '__unit_in_org2__') RETURNING id INTO unit2;
  BEGIN
    INSERT INTO organisation_office_attachments (office_id, governing_organisation_id, organisation_unit_id) VALUES (off1, org1, unit2);
    RAISE EXCEPTION 'FAIL: attachment via a Unit outside the governing Organisation accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: attachment via a Unit outside the governing Organisation rejected (FR-012)';
  END;

  -- Attachment applicability: reversed interval rejected (FR-015)
  BEGIN
    INSERT INTO organisation_office_attachments (office_id, governing_organisation_id, effective_from, effective_to)
      VALUES (off1, org1, DATE '2024-01-01', DATE '2023-01-01');
    RAISE EXCEPTION 'FAIL: reversed attachment interval accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: reversed attachment applicability rejected (FR-015)'; END;

  -- FR-013: attachment did NOT create/alter Unit constitutive containment
  IF (SELECT count(*) FROM organisation_units WHERE parent_unit_id IS NOT NULL AND organisation_id=org1) <> 0 THEN
    RAISE EXCEPTION 'FAIL: office attachment altered Unit containment';
  END IF;
  RAISE NOTICE 'PASS: Office attachment did not alter Organisation Unit constitutive containment (FR-013)';
END $$;
ROLLBACK;

-- ================================================================================
-- SECTION 3 - Office as canonical fact subject (FR-002; via F-3 widened CHECKs)
-- ================================================================================
BEGIN;
DO $$
DECLARE off1 uuid; cat uuid;
BEGIN
  INSERT INTO organisation_offices (title) VALUES ('__office_facts__') RETURNING id INTO off1;

  -- Canonical Name on an Office
  INSERT INTO organisation_names (subject_id, subject_kind, value) VALUES (off1, 'organisational_office', '__office_name__');
  -- Canonical Identifier on an Office
  INSERT INTO organisation_identifiers (subject_id, subject_kind, scheme, designation) VALUES (off1, 'organisational_office', 'internal_ref', 'OFF-1');
  -- Classification assignment on an Office (create a non-system scheme/category in-txn to assign)
  INSERT INTO classification_schemes (key,label) VALUES ('office_kind','Office Kind') RETURNING id INTO cat;
  INSERT INTO classification_categories (scheme_id,key,label) VALUES (cat,'board','Board') RETURNING id INTO cat;
  INSERT INTO classification_assignments (subject_id, subject_kind, category_id) VALUES (off1, 'organisational_office', cat);

  RAISE NOTICE 'PASS: Office admitted as subject of canonical Name, Identifier and Classification (FR-002)';
END $$;
ROLLBACK;

-- ================================================================================
-- SECTION 4 - Office as Relationship participant (FR-011/017; non-office-holding)
-- ================================================================================
BEGIN;
DO $$
DECLARE org1 uuid; off1 uuid; t uuid; rel uuid;
BEGIN
  SELECT id INTO org1 FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  INSERT INTO organisation_offices (title) VALUES ('__office_participant__') RETURNING id INTO off1;
  SELECT id INTO t FROM relationship_types WHERE key='membership';   -- an ordinary (non-office-holding) relationship
  INSERT INTO organisation_relationships (type_id) VALUES (t) RETURNING id INTO rel;
  INSERT INTO organisation_relationship_participants (relationship_id, subject_id, subject_kind, participant_role)
    VALUES (rel, off1, 'organisational_office', 'member'), (rel, org1, 'organisation', 'body');
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE NOTICE 'PASS: Organisational Office admitted as a Relationship participant (FR-011/017)';
END $$;
ROLLBACK;

-- ================================================================================
-- SECTION 5 - Office-holding mechanism present, actual facts PRESERVED-unavailable (F-1)
-- ================================================================================
-- The office_holding type exists (mechanism); creating an office_holding Relationship instance
-- is rejected by the preserved-dependency guard (no phantom holder; >=2 invariant intact).
BEGIN;
DO $$
DECLARE t uuid;
BEGIN
  SELECT id INTO t FROM relationship_types WHERE key='office_holding';
  IF t IS NULL THEN RAISE EXCEPTION 'FAIL: office_holding mechanism/type not present (FR-016)'; END IF;
  RAISE NOTICE 'PASS: office_holding Relationship type/mechanism present (FR-016)';

  BEGIN
    INSERT INTO organisation_relationships (type_id) VALUES (t);
    RAISE EXCEPTION 'FAIL: an office_holding relationship instance was created';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    IF position('preserved external dependency' IN SQLERRM) = 0 THEN
      RAISE EXCEPTION 'FAIL: unexpected error creating office_holding: %', SQLERRM;
    END IF;
    RAISE NOTICE 'PASS: office-holding facts remain unavailable - external holder-subject dependency preserved (F-1; FR-018)';
  END;

  -- office_holding is a protected system type
  BEGIN
    DELETE FROM relationship_types WHERE key='office_holding';
    RAISE EXCEPTION 'FAIL: system office_holding type deleted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: office_holding system type protected from deletion';
  END;
END $$;
ROLLBACK;

-- ================================================================================
-- SECTION 6 - Preservation of existing accepted subject kinds (no regression)
-- ================================================================================
-- The widened CHECKs still accept the original kinds: an organisation Name still inserts.
BEGIN;
DO $$
DECLARE org1 uuid;
BEGIN
  SELECT id INTO org1 FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  INSERT INTO organisation_names (subject_id, subject_kind, value) VALUES (org1, 'organisation', '__still_ok__');
  RAISE NOTICE 'PASS: existing organisation subject kind still accepted after widening';
  -- and an invalid kind is still rejected
  BEGIN
    INSERT INTO organisation_names (subject_id, subject_kind, value) VALUES (org1, 'not_a_kind', '__bad__');
    RAISE EXCEPTION 'FAIL: invalid subject_kind accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: invalid subject_kind still rejected (only the three governed kinds allowed)'; END;
END $$;
ROLLBACK;

-- ================================================================================
-- SECTION 7 - Final data-preservation confirmation (read-only)
-- ================================================================================
SELECT
  (SELECT count(*) FROM organisations)                          AS organisations,        -- expect 84
  (SELECT count(*) FROM organisation_offices)                  AS offices,              -- expect 0 (all tests rolled back)
  (SELECT count(*) FROM organisation_office_attachments)       AS attachments,          -- expect 0
  (SELECT count(*) FROM relationship_types)                    AS relationship_types,   -- expect 3
  (SELECT count(*) FROM organisation_subjects WHERE subject_kind='organisational_office') AS office_subjects, -- expect 0
  (SELECT count(*) FROM organisations WHERE type='internal')   AS internal_unchanged;   -- expect 2
