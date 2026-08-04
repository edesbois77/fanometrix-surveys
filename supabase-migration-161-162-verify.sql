-- === ORG-004 BP-05 PRODUCTION VERIFICATION - VERIFICATION ONLY, NOT A MIGRATION ===
--
-- Covers migrations 161-162 and BP-01..BP-05 regression. SAFE FOR PRODUCTION: every
-- write/probe is wrapped in BEGIN ... ROLLBACK and leaves NO data behind. Negative tests
-- catch the ACTUAL SQLSTATE (raise_exception=P0001; check_violation; foreign_key_violation);
-- genuine unexpected errors still abort. Read the NOTICEs and result rows.

-- ================================================================================
-- SECTION 0 - BP-01..BP-04 regression + scope (read-only)
-- ================================================================================
SELECT
  (SELECT count(*) FROM organisations)                                                        AS organisations,          -- expect 84
  (SELECT count(*) FROM organisation_subjects WHERE subject_kind='organisation')              AS org_subjects,            -- expect 84
  (SELECT count(*) FROM organisation_names WHERE subject_kind='organisation' AND is_primary AND deleted_at IS NULL) AS primary_names, -- expect 84
  (SELECT count(*) FROM classification_assignments WHERE effective_to IS NULL AND deleted_at IS NULL) AS current_assignments, -- expect 82
  (SELECT count(*) FROM relationship_types)                                                   AS relationship_types;      -- expect 3

-- BP-05 objects present (expect all non-null).
SELECT to_regclass('public.organisation_authorities')            AS authorities,
       to_regclass('public.organisation_authority_constraints')  AS constraints,
       to_regclass('public.organisation_authority_bases')        AS bases;

-- NON-FIRST-CLASS: Authority is NOT a subject kind, and has no Name/Identifier/Classification/
-- Relationship of its own. Expect: authority is not among subject kinds; no status/lifecycle column.
SELECT DISTINCT subject_kind FROM organisation_subjects ORDER BY subject_kind;  -- expect organisation only (no 'authority')
SELECT column_name FROM information_schema.columns
  WHERE table_name='organisation_authorities'
    AND column_name IN ('status','state','lifecycle','name','classification','confidence','evidence');  -- expect 0 rows

-- SEPARATION: authority tables have RLS on with only a deny-anon policy (grant no permissions);
-- no FK from users/auth to any authority table.
SELECT c.relname, c.relrowsecurity AS rls, (SELECT string_agg(policyname, ', ') FROM pg_policies p WHERE p.tablename=c.relname) AS policies
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('organisation_authorities','organisation_authority_constraints','organisation_authority_bases')
  ORDER BY c.relname;
SELECT conrelid::regclass::text AS from_table, confrelid::regclass::text AS to_table
  FROM pg_constraint WHERE contype='f'
    AND confrelid::regclass::text LIKE 'organisation_authorit%';  -- expect only authority-internal FKs, nothing from users/auth

-- SCOPE: no ORG-005 / further structures (expect 0 rows).
SELECT table_name FROM information_schema.tables WHERE table_schema='public'
  AND table_name IN ('person','persons','actors','delegations','agencies','appointments');

-- ================================================================================
-- SECTION 1 - Authority fact: holder kinds, principal, scope, applicability (FA-A/FA-D)
-- ================================================================================
BEGIN;
DO $$
DECLARE org1 uuid; org2 uuid; unit1 uuid; off1 uuid; a1 uuid; a2 uuid;
BEGIN
  SELECT id INTO org1 FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  SELECT id INTO org2 FROM organisations WHERE deleted_at IS NULL AND id<>org1 LIMIT 1;

  -- holder = Organisation (IC-01 actor admitted); principal = Organisation; scope + applicability
  INSERT INTO organisation_authorities (holder_subject_id, holder_subject_kind, organisation_id, scope)
    VALUES (org2, 'organisation', org1, 'sign procurement contracts up to threshold') RETURNING id INTO a1;
  RAISE NOTICE 'PASS: Authority fact created (holder=organisation, principal, scope) (FR-001/003/004)';

  -- Authority is NOT registered as a subject (non-first-class, FR-006)
  IF EXISTS (SELECT 1 FROM organisation_subjects WHERE subject_id=a1) THEN
    RAISE EXCEPTION 'FAIL: Authority was registered as a subject (must be non-first-class)';
  END IF;
  RAISE NOTICE 'PASS: Authority is non-first-class - not registered in organisation_subjects (FR-006)';

  -- holder = Organisation Unit and Organisation Office are admitted IC-01 actors
  INSERT INTO organisation_units (organisation_id, name) VALUES (org1, '__auth_unit__') RETURNING id INTO unit1;
  INSERT INTO organisation_authorities (holder_subject_id, holder_subject_kind, organisation_id, scope)
    VALUES (unit1, 'organisation_unit', org1, 'approve unit-level expenditure');
  INSERT INTO organisation_offices (title) VALUES ('__auth_office__') RETURNING id INTO off1;
  INSERT INTO organisation_authorities (holder_subject_id, holder_subject_kind, organisation_id, scope)
    VALUES (off1, 'organisational_office', org1, 'act as signatory');
  RAISE NOTICE 'PASS: Organisation Unit and Organisational Office admitted as Authority holders';

  -- MULTIPLICITY (FR-007/022): multiple, overlapping Authority facts for the same holder/org allowed
  INSERT INTO organisation_authorities (holder_subject_id, holder_subject_kind, organisation_id, scope, effective_from)
    VALUES (org2, 'organisation', org1, 'represent in regulatory filings', DATE '2020-01-01') RETURNING id INTO a2;
  INSERT INTO organisation_authorities (holder_subject_id, holder_subject_kind, organisation_id, scope, effective_from)
    VALUES (org2, 'organisation', org1, 'represent in regulatory filings', DATE '2019-01-01');
  IF (SELECT count(*) FROM organisation_authorities WHERE holder_subject_id=org2 AND organisation_id=org1) < 3 THEN
    RAISE EXCEPTION 'FAIL: multiple/overlapping Authority facts not permitted';
  END IF;
  RAISE NOTICE 'PASS: multiple overlapping Authority facts per holder/organisation allowed (FR-007/022)';

  -- applicability boundary: zero-length rejected (half-open, FR-018/019)
  BEGIN
    INSERT INTO organisation_authorities (holder_subject_id, holder_subject_kind, organisation_id, scope, effective_from, effective_to)
      VALUES (org2, 'organisation', org1, '__bad__', DATE '2024-01-01', DATE '2024-01-01');
    RAISE EXCEPTION 'FAIL: zero-length authority interval accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: zero-length authority applicability rejected (FR-018)'; END;

  -- blank scope rejected (FR-004)
  BEGIN
    INSERT INTO organisation_authorities (holder_subject_id, holder_subject_kind, organisation_id, scope)
      VALUES (org2, 'organisation', org1, '   ');
    RAISE EXCEPTION 'FAIL: blank scope accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: blank scope rejected (FR-004)'; END;
END $$;
ROLLBACK;

-- Preserved holder dependency + integrity (BE-01): external actor kind rejected; non-existent holder rejected.
BEGIN;
DO $$
DECLARE org1 uuid;
BEGIN
  SELECT id INTO org1 FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  BEGIN
    INSERT INTO organisation_authorities (holder_subject_id, holder_subject_kind, organisation_id, scope)
      VALUES (org1, 'person', org1, 'x');
    RAISE EXCEPTION 'FAIL: external-actor holder kind accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: external-actor (person) holder rejected - external holder dependency preserved (BE-01)'; END;
  BEGIN
    INSERT INTO organisation_authorities (holder_subject_id, holder_subject_kind, organisation_id, scope)
      VALUES ('00000000-0000-0000-0000-0000000000ab', 'organisation', org1, 'x');
    RAISE EXCEPTION 'FAIL: non-existent holder accepted';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: non-existent holder subject rejected (FR-002 integrity)'; END;
END $$;
ROLLBACK;

-- Principal mandatory + Unit context must belong to the principal (FR-003).
BEGIN;
DO $$
DECLARE org1 uuid; org2 uuid; unit2 uuid;
BEGIN
  SELECT id INTO org1 FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  SELECT id INTO org2 FROM organisations WHERE deleted_at IS NULL AND id<>org1 LIMIT 1;
  BEGIN
    INSERT INTO organisation_authorities (holder_subject_id, holder_subject_kind, organisation_id, scope)
      VALUES (org1, 'organisation', NULL, 'x');
    RAISE EXCEPTION 'FAIL: authority without a principal accepted';
  EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'PASS: principal Organisation is mandatory (FR-003)'; END;

  INSERT INTO organisation_units (organisation_id, name) VALUES (org2, '__unit_other_org__') RETURNING id INTO unit2;
  BEGIN
    INSERT INTO organisation_authorities (holder_subject_id, holder_subject_kind, organisation_id, organisation_unit_id, scope)
      VALUES (org1, 'organisation', org1, unit2, 'x');
    RAISE EXCEPTION 'FAIL: context unit outside principal organisation accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: Unit context must belong to the principal Organisation (FR-003)';
  END;
END $$;
ROLLBACK;

-- FR-008: changing a related fact (e.g. the principal Organisation's name) does not auto-change Authority.
BEGIN;
DO $$
DECLARE org1 uuid; a1 uuid; s text;
BEGIN
  SELECT id INTO org1 FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  INSERT INTO organisation_authorities (holder_subject_id, holder_subject_kind, organisation_id, scope)
    VALUES (org1, 'organisation', org1, 'keep-me') RETURNING id INTO a1;
  UPDATE organisations SET name = name || ' (edited)' WHERE id=org1;   -- a related fact changes
  SELECT scope INTO s FROM organisation_authorities WHERE id=a1;
  IF s <> 'keep-me' THEN RAISE EXCEPTION 'FAIL: authority changed when a related fact changed'; END IF;
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
  INSERT INTO organisation_authorities (holder_subject_id, holder_subject_kind, organisation_id, scope)
    VALUES (org1, 'organisation', org1, 'sign contracts') RETURNING id INTO a1;
  INSERT INTO organisation_authority_constraints (authority_id, constraint_type, descriptor)
    VALUES (a1, 'threshold', 'up to 100000 GBP'), (a1, 'jurisdiction', 'England and Wales');
  RAISE NOTICE 'PASS: material constraints (threshold, jurisdiction) attached to Authority (FR-004/011)';
  BEGIN
    INSERT INTO organisation_authority_constraints (authority_id, constraint_type, descriptor) VALUES (a1, 'mood', 'x');
    RAISE EXCEPTION 'FAIL: invalid constraint type accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: only governed constraint types (threshold/jurisdiction/condition/limit) accepted'; END;
END $$;
ROLLBACK;

-- ================================================================================
-- SECTION 3 - Basis references: internal consumed-by-reference, external reference-only (FA-C)
-- ================================================================================
BEGIN;
DO $$
DECLARE org1 uuid; org2 uuid; a1 uuid; off1 uuid; t uuid; rel uuid;
BEGIN
  SELECT id INTO org1 FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  SELECT id INTO org2 FROM organisations WHERE deleted_at IS NULL AND id<>org1 LIMIT 1;
  INSERT INTO organisation_authorities (holder_subject_id, holder_subject_kind, organisation_id, scope)
    VALUES (org1, 'organisation', org1, 'act under basis') RETURNING id INTO a1;

  -- internal Office basis (consumed by reference; not recreated) - FR-016
  INSERT INTO organisation_offices (title) VALUES ('__basis_office__') RETURNING id INTO off1;
  INSERT INTO organisation_authority_bases (authority_id, basis_kind, basis_office_id) VALUES (a1, 'office', off1);

  -- internal Relationship basis (consumed by reference) - FR-016
  SELECT id INTO t FROM relationship_types WHERE key='membership';
  INSERT INTO organisation_relationships (type_id) VALUES (t) RETURNING id INTO rel;
  INSERT INTO organisation_relationship_participants (relationship_id, subject_id, subject_kind)
    VALUES (rel, org1, 'organisation'), (rel, org2, 'organisation');
  SET CONSTRAINTS ALL IMMEDIATE;
  INSERT INTO organisation_authority_bases (authority_id, basis_kind, basis_relationship_id) VALUES (a1, 'relationship', rel);

  -- external basis (reference-only opaque; R07 does not own its semantics) - FR-017
  INSERT INTO organisation_authority_bases (authority_id, basis_kind, basis_external_ref)
    VALUES (a1, 'contract', 'Master Services Agreement 2026-014');
  RAISE NOTICE 'PASS: Office + Relationship consumed by reference; external Contract basis reference-only (FR-015/016/017)';

  -- ref-shape integrity: an office basis must carry an office ref, not an external ref
  BEGIN
    INSERT INTO organisation_authority_bases (authority_id, basis_kind, basis_external_ref) VALUES (a1, 'office', 'not-an-office');
    RAISE EXCEPTION 'FAIL: office basis with an external ref accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: basis reference shape enforced per kind (internal vs external)'; END;
END $$;
ROLLBACK;

-- ================================================================================
-- SECTION 4 - Final data-preservation confirmation (read-only)
-- ================================================================================
SELECT
  (SELECT count(*) FROM organisations)                            AS organisations,   -- expect 84
  (SELECT count(*) FROM organisation_authorities)                AS authorities,      -- expect 0 (all rolled back)
  (SELECT count(*) FROM organisation_authority_constraints)      AS constraints,      -- expect 0
  (SELECT count(*) FROM organisation_authority_bases)            AS bases,            -- expect 0
  (SELECT count(*) FROM organisation_subjects WHERE subject_kind='organisation') AS org_subjects; -- expect 84
