-- === ORG-004 BP-05 PRODUCTION VERIFICATION - VERIFICATION ONLY, NOT A MIGRATION ===
--
-- Covers migrations 161-162 and BP-01..BP-05 regression. SAFE FOR PRODUCTION: every
-- write/probe is wrapped in BEGIN ... ROLLBACK and leaves NO data behind. Negative tests
-- catch the ACTUAL SQLSTATE (raise_exception=P0001; check_violation; foreign_key_violation;
-- not_null_violation); genuine unexpected errors still abort. Read the NOTICEs and result rows.
--
-- Holder eligibility is a PRESERVED external dependency: authority_eligible_holder_kinds is
-- EMPTY, so real Authority instances are unavailable. Tests that need an Authority row admit a
-- throwaway kind '__verify_kind__' INSIDE their rolled-back transaction to exercise the
-- mechanism additively; nothing persists.

-- ================================================================================
-- SECTION 0 - BP-01..BP-04 regression + scope + separation (read-only)
-- ================================================================================
SELECT
  (SELECT count(*) FROM organisations)                                                        AS organisations,          -- expect 84
  (SELECT count(*) FROM organisation_subjects WHERE subject_kind='organisation')              AS org_subjects,            -- expect 84
  (SELECT count(*) FROM organisation_names WHERE subject_kind='organisation' AND is_primary AND deleted_at IS NULL) AS primary_names, -- expect 84
  (SELECT count(*) FROM classification_assignments WHERE effective_to IS NULL AND deleted_at IS NULL) AS current_assignments, -- expect 82
  (SELECT count(*) FROM relationship_types)                                                   AS relationship_types;      -- expect 3

-- BP-05 objects present (expect all non-null).
SELECT to_regclass('public.authority_eligible_holder_kinds')     AS holder_kinds_registry,
       to_regclass('public.organisation_authorities')            AS authorities,
       to_regclass('public.organisation_authority_constraints')  AS constraints,
       to_regclass('public.organisation_authority_bases')        AS bases;

-- PRESERVED DEPENDENCY: the eligible-holder-kind registry is EMPTY (expect 0).
SELECT count(*) AS eligible_holder_kinds FROM authority_eligible_holder_kinds;

-- NON-FIRST-CLASS: 'authority' is not a subject kind; no status/name/class column on the fact.
SELECT DISTINCT subject_kind FROM organisation_subjects ORDER BY subject_kind;   -- expect: organisation only
SELECT column_name FROM information_schema.columns
  WHERE table_name='organisation_authorities'
    AND column_name IN ('status','state','lifecycle','name','classification','confidence','evidence');  -- expect 0 rows

-- SEPARATION: authority tables RLS-on with deny-anon only; no FK from users/auth to them.
SELECT c.relname, c.relrowsecurity AS rls,
       (SELECT string_agg(policyname, ', ') FROM pg_policies p WHERE p.tablename=c.relname) AS policies
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN
    ('authority_eligible_holder_kinds','organisation_authorities','organisation_authority_constraints','organisation_authority_bases')
  ORDER BY c.relname;

-- ================================================================================
-- SECTION 1 - Holder eligibility PRESERVED: no holder kind may be used (control J-1)
-- ================================================================================
-- With the registry empty, EVERY holder kind is rejected - including existing IC-01 subject
-- kinds (not eligible merely because they exist) and an external actor kind (not owned).
BEGIN;
DO $$
DECLARE org1 uuid; k text;
BEGIN
  SELECT id INTO org1 FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  FOREACH k IN ARRAY ARRAY['organisation','organisation_unit','organisational_office','person'] LOOP
    BEGIN
      INSERT INTO organisation_authorities (holder_subject_id, holder_subject_kind, organisation_id, scope)
        VALUES (org1, k, org1, 'x');
      RAISE EXCEPTION 'FAIL: holder kind % was accepted while no eligible holder is admitted', k;
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
      RAISE NOTICE 'PASS: holder kind "%" rejected - holder eligibility is a preserved external dependency (J-1; FR-002/BE-01)', k;
    END;
  END LOOP;
END $$;
ROLLBACK;

-- Additive evolvability + non-first-class: admitting an eligible holder kind under an eligibility
-- architecture unblocks Authority WITHOUT redesign. Demonstrated with a throwaway kind, rolled back.
BEGIN;
DO $$
DECLARE org1 uuid; a1 uuid;
BEGIN
  SELECT id INTO org1 FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  INSERT INTO authority_eligible_holder_kinds (kind, note) VALUES ('__verify_kind__', 'verification only');
  INSERT INTO organisation_authorities (holder_subject_id, holder_subject_kind, organisation_id, scope)
    VALUES (org1, '__verify_kind__', org1, 'sign contracts') RETURNING id INTO a1;
  RAISE NOTICE 'PASS: admitting an eligible holder kind unblocks Authority (additive evolvability, no redesign)';
  IF EXISTS (SELECT 1 FROM organisation_subjects WHERE subject_id=a1) THEN
    RAISE EXCEPTION 'FAIL: Authority registered as a subject (must be non-first-class)';
  END IF;
  RAISE NOTICE 'PASS: Authority is non-first-class - not registered in organisation_subjects (FR-006)';
END $$;
ROLLBACK;

-- Principal mandatory; Unit context must belong to the principal (FR-003 / J-2); scope required;
-- applicability boundary; multiplicity/overlap; no auto-change (FR-008). Uses the throwaway kind.
BEGIN;
DO $$
DECLARE org1 uuid; org2 uuid; unit2 uuid; s text; a1 uuid;
BEGIN
  SELECT id INTO org1 FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  SELECT id INTO org2 FROM organisations WHERE deleted_at IS NULL AND id<>org1 LIMIT 1;
  INSERT INTO authority_eligible_holder_kinds (kind) VALUES ('__verify_kind__');

  BEGIN
    INSERT INTO organisation_authorities (holder_subject_id, holder_subject_kind, organisation_id, scope)
      VALUES (org1, '__verify_kind__', NULL, 'x');
    RAISE EXCEPTION 'FAIL: authority without a principal accepted';
  EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'PASS: principal Organisation is mandatory (FR-003)'; END;

  INSERT INTO organisation_units (organisation_id, name) VALUES (org2, '__unit_other_org__') RETURNING id INTO unit2;
  BEGIN
    INSERT INTO organisation_authorities (holder_subject_id, holder_subject_kind, organisation_id, organisation_unit_id, scope)
      VALUES (org1, '__verify_kind__', org1, unit2, 'x');
    RAISE EXCEPTION 'FAIL: context unit outside principal accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: Unit context must belong to the principal Organisation (FR-003 / J-2)';
  END;

  BEGIN
    INSERT INTO organisation_authorities (holder_subject_id, holder_subject_kind, organisation_id, scope)
      VALUES (org1, '__verify_kind__', org1, '   ');
    RAISE EXCEPTION 'FAIL: blank scope accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: blank scope rejected (FR-004)'; END;

  BEGIN
    INSERT INTO organisation_authorities (holder_subject_id, holder_subject_kind, organisation_id, scope, effective_from, effective_to)
      VALUES (org1, '__verify_kind__', org1, 'x', DATE '2024-01-01', DATE '2024-01-01');
    RAISE EXCEPTION 'FAIL: zero-length applicability accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: zero-length authority applicability rejected (FR-018)'; END;

  -- multiplicity / overlap (FR-007/022)
  INSERT INTO organisation_authorities (holder_subject_id, holder_subject_kind, organisation_id, scope, effective_from)
    VALUES (org1, '__verify_kind__', org1, 'represent', DATE '2020-01-01') RETURNING id INTO a1;
  INSERT INTO organisation_authorities (holder_subject_id, holder_subject_kind, organisation_id, scope, effective_from)
    VALUES (org1, '__verify_kind__', org1, 'represent', DATE '2019-01-01');
  IF (SELECT count(*) FROM organisation_authorities WHERE holder_subject_id=org1 AND organisation_id=org1) < 2 THEN
    RAISE EXCEPTION 'FAIL: multiple/overlapping Authority facts not permitted';
  END IF;
  RAISE NOTICE 'PASS: multiple overlapping Authority facts allowed (FR-007/022)';

  -- FR-008: a related-fact change does not auto-change Authority
  UPDATE organisations SET name = name || ' (edited)' WHERE id=org1;
  SELECT scope INTO s FROM organisation_authorities WHERE id=a1;
  IF s <> 'represent' THEN RAISE EXCEPTION 'FAIL: authority changed when a related fact changed'; END IF;
  RAISE NOTICE 'PASS: Authority not auto-changed by a related-fact change (FR-008)';
END $$;
ROLLBACK;

-- ================================================================================
-- SECTION 2 - Material constraints (FA-B; FR-004/011/012)
-- ================================================================================
BEGIN;
DO $$
DECLARE org1 uuid; a1 uuid;
BEGIN
  SELECT id INTO org1 FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  INSERT INTO authority_eligible_holder_kinds (kind) VALUES ('__verify_kind__');
  INSERT INTO organisation_authorities (holder_subject_id, holder_subject_kind, organisation_id, scope)
    VALUES (org1, '__verify_kind__', org1, 'sign contracts') RETURNING id INTO a1;
  INSERT INTO organisation_authority_constraints (authority_id, constraint_type, descriptor)
    VALUES (a1, 'threshold', 'up to 100000 GBP'), (a1, 'jurisdiction', 'England and Wales');
  RAISE NOTICE 'PASS: material constraints (threshold, jurisdiction) attached (FR-004/011)';
  BEGIN
    INSERT INTO organisation_authority_constraints (authority_id, constraint_type, descriptor) VALUES (a1, 'mood', 'x');
    RAISE EXCEPTION 'FAIL: invalid constraint type accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: only governed constraint types accepted'; END;
END $$;
ROLLBACK;

-- ================================================================================
-- SECTION 3 - Basis references: internal consumed-by-reference; external reference-only (FA-C)
-- ================================================================================
BEGIN;
DO $$
DECLARE org1 uuid; org2 uuid; a1 uuid; off1 uuid; t uuid; rel uuid;
BEGIN
  SELECT id INTO org1 FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  SELECT id INTO org2 FROM organisations WHERE deleted_at IS NULL AND id<>org1 LIMIT 1;
  INSERT INTO authority_eligible_holder_kinds (kind) VALUES ('__verify_kind__');
  INSERT INTO organisation_authorities (holder_subject_id, holder_subject_kind, organisation_id, scope)
    VALUES (org1, '__verify_kind__', org1, 'act under basis') RETURNING id INTO a1;

  INSERT INTO organisation_offices (title) VALUES ('__basis_office__') RETURNING id INTO off1;
  INSERT INTO organisation_authority_bases (authority_id, basis_kind, basis_office_id) VALUES (a1, 'office', off1);

  SELECT id INTO t FROM relationship_types WHERE key='membership';
  INSERT INTO organisation_relationships (type_id) VALUES (t) RETURNING id INTO rel;
  INSERT INTO organisation_relationship_participants (relationship_id, subject_id, subject_kind)
    VALUES (rel, org1, 'organisation'), (rel, org2, 'organisation');
  SET CONSTRAINTS ALL IMMEDIATE;
  INSERT INTO organisation_authority_bases (authority_id, basis_kind, basis_relationship_id) VALUES (a1, 'relationship', rel);

  INSERT INTO organisation_authority_bases (authority_id, basis_kind, basis_external_ref)
    VALUES (a1, 'contract', 'Master Services Agreement 2026-014');
  RAISE NOTICE 'PASS: Office + Relationship consumed by reference; external Contract basis reference-only (FR-015/016/017)';

  BEGIN
    INSERT INTO organisation_authority_bases (authority_id, basis_kind, basis_external_ref) VALUES (a1, 'office', 'not-an-office');
    RAISE EXCEPTION 'FAIL: office basis with an external ref accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: basis reference shape enforced per kind'; END;
END $$;
ROLLBACK;

-- ================================================================================
-- SECTION 4 - Final data-preservation confirmation (read-only)
-- ================================================================================
SELECT
  (SELECT count(*) FROM organisations)                            AS organisations,          -- expect 84
  (SELECT count(*) FROM authority_eligible_holder_kinds)          AS eligible_holder_kinds,   -- expect 0 (preserved)
  (SELECT count(*) FROM organisation_authorities)                AS authorities,             -- expect 0
  (SELECT count(*) FROM organisation_authority_constraints)      AS constraints,             -- expect 0
  (SELECT count(*) FROM organisation_authority_bases)            AS bases,                   -- expect 0
  (SELECT count(*) FROM organisation_subjects WHERE subject_kind='organisation') AS org_subjects; -- expect 84
