-- === ORG-004 BP-03 PRODUCTION VERIFICATION - VERIFICATION ONLY, NOT A MIGRATION ===
--
-- Covers migrations 154, 155, 156 and the approved BP-03 acceptance + bounded-exclusion
-- requirements. SAFE FOR PRODUCTION: every write/probe test is wrapped in BEGIN ... ROLLBACK
-- and leaves NO data behind. Read-only sections return result rows; write sections print
-- PASS/FAIL via RAISE NOTICE. Negative tests catch the ACTUAL SQLSTATE raised by the
-- specific guard (P0001 raise_exception for trigger/protection guards; check_violation for
-- CHECKs; foreign_key_violation for FKs; unique_violation for uniques). A genuine unexpected
-- error still aborts. Run the whole file; read the NOTICEs and the result rows.

-- ================================================================================
-- SECTION 0 - BP-01 / BP-02 regression + Organisation data preservation (read-only)
-- ================================================================================
-- Expect: organisations 84, organisation-kind subjects 84, primary Names 84, name
-- projection mismatches 0, current organisation_category assignments 82. Internal orgs 2.
SELECT
  (SELECT count(*) FROM organisations)                                                        AS organisations,           -- expect 84
  (SELECT count(DISTINCT id) FROM organisations)                                              AS distinct_org_uuids,       -- expect 84
  (SELECT count(*) FROM organisations WHERE deleted_at IS NOT NULL)                           AS soft_deleted_orgs,        -- expect 5
  (SELECT count(*) FROM organisation_subjects WHERE subject_kind='organisation')              AS org_subjects,             -- expect 84
  (SELECT count(*) FROM organisation_names WHERE subject_kind='organisation'
      AND is_primary AND deleted_at IS NULL)                                                  AS primary_names,            -- expect 84
  (SELECT count(*) FROM organisations o JOIN organisation_names n
      ON n.subject_id=o.id AND n.is_primary AND n.deleted_at IS NULL AND n.value=o.name)      AS name_projection_matches,  -- expect 84
  (SELECT count(*) FROM classification_assignments WHERE effective_to IS NULL AND deleted_at IS NULL) AS current_assignments, -- expect 82
  (SELECT count(*) FROM organisations WHERE type='internal')                                  AS internal_orgs;            -- expect 2

-- Any Organisation missing its subject row (expect 0 rows) - BP-01 invariant intact.
SELECT o.id FROM organisations o
  LEFT JOIN organisation_subjects s ON s.subject_id=o.id AND s.subject_kind='organisation'
  WHERE s.subject_id IS NULL;

-- ================================================================================
-- SECTION 1 - BP-03 structure, scope and Migration 156 authorisation (read-only)
-- ================================================================================
-- All four BP-03 objects exist (expect 4 columns, all non-null).
SELECT to_regclass('public.organisation_identities')                 AS identities,
       to_regclass('public.relationship_types')                      AS rel_types,
       to_regclass('public.organisation_relationships')              AS relationships,
       to_regclass('public.organisation_relationship_participants')  AS participants;

-- Seeded system relationship types present (expect 2: membership + lineage_predecessor_successor).
SELECT key, label, directionality, is_system FROM relationship_types ORDER BY key;

-- SCOPE: no BP-04/BP-05 structures introduced (expect 0 rows).
SELECT table_name FROM information_schema.tables WHERE table_schema='public'
  AND table_name IN ('organisational_offices','office_holdings','organisation_offices',
                     'organisation_authorities','office_participants');

-- SCOPE: no Status / History / lifecycle / evidence / legal columns on BP-03 fact tables (expect 0 rows).
SELECT table_name, column_name FROM information_schema.columns
  WHERE table_name IN ('organisation_identities','organisation_relationships','organisation_relationship_participants','relationship_types')
    AND column_name IN ('status','state','lifecycle','history','confidence','evidence','provenance',
                        'acceptance','legal_identity','registration','authority','permission');

-- Migration 156 RPC exists (expect 1 row). prosecdef must be FALSE (SECURITY INVOKER).
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef AS security_definer
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='create_organisation_relationship';

-- AUTHORISATION: the RPC is server-only. Expect anon=false, authenticated=false, service_role=true.
SELECT
  has_function_privilege('anon',          'public.create_organisation_relationship(uuid,text,date,date,jsonb)', 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', 'public.create_organisation_relationship(uuid,text,date,date,jsonb)', 'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role',  'public.create_organisation_relationship(uuid,text,date,date,jsonb)', 'EXECUTE') AS service_role_execute;

-- RELATIONSHIPS GRANT NO PERMISSIONS: the relationship/identity tables have RLS on and ONLY a
-- deny-anon policy (no permissive grant policy). Expect each rls_enabled=true, one *_no_anon policy.
SELECT c.relname, c.relrowsecurity AS rls_enabled,
       (SELECT count(*) FROM pg_policies pol WHERE pol.tablename=c.relname) AS policy_count,
       (SELECT string_agg(pol.policyname, ', ') FROM pg_policies pol WHERE pol.tablename=c.relname) AS policies
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
    AND c.relname IN ('organisation_identities','relationship_types','organisation_relationships','organisation_relationship_participants')
  ORDER BY c.relname;

-- UNIT CONTAINMENT REMAINS SEPARATE: containment still lives on organisation_units
-- (organisation_id + parent_unit_id), and the relationship tables carry NO containment column.
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_name='organisation_units'
     AND column_name IN ('organisation_id','parent_unit_id'))                              AS unit_containment_columns,  -- expect 2
  (SELECT count(*) FROM information_schema.columns WHERE table_name='organisation_relationships'
     AND column_name IN ('parent_unit_id','organisation_id','contains'))                   AS relationship_containment_columns; -- expect 0

-- ================================================================================
-- SECTION 2 - R03 Organisational Identity (rolled back)
-- ================================================================================
BEGIN;
DO $$
DECLARE org uuid; id1 uuid; id2 uuid;
BEGIN
  SELECT id INTO org FROM organisations WHERE deleted_at IS NULL LIMIT 1;

  -- create + MULTIPLE identities per organisation (FR-001/004); optionality is the default (0 allowed)
  INSERT INTO organisation_identities (organisation_id, label) VALUES (org, '__identity_A__') RETURNING id INTO id1;
  INSERT INTO organisation_identities (organisation_id, label) VALUES (org, '__identity_B__') RETURNING id INTO id2;
  IF (SELECT count(*) FROM organisation_identities WHERE organisation_id=org AND deleted_at IS NULL) < 2 THEN
    RAISE EXCEPTION 'FAIL: organisation could not hold multiple identities';
  END IF;
  RAISE NOTICE 'PASS: identity created; multiple identities per organisation allowed (FR-001/004)';

  -- CORRECTION in place, same row, no fabricated history (FR-015/016)
  UPDATE organisation_identities SET label='__identity_A_corrected__' WHERE id=id1;
  RAISE NOTICE 'PASS: identity correction is in place (FR-015/016)';

  -- CHANGE: cease then commence a replacement; earlier identity retained as history (FR-012)
  UPDATE organisation_identities SET effective_to = CURRENT_DATE WHERE id=id2;
  INSERT INTO organisation_identities (organisation_id, label, effective_from) VALUES (org, '__identity_B2__', CURRENT_DATE);
  IF NOT EXISTS (SELECT 1 FROM organisation_identities WHERE id=id2 AND effective_to IS NOT NULL AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'FAIL: ceased identity not retained as history';
  END IF;
  RAISE NOTICE 'PASS: identity change ceases old (history kept) and commences new (FR-012)';

  -- Effective Applicability: zero-length interval rejected (half-open, FR-019)
  BEGIN
    INSERT INTO organisation_identities (organisation_id, label, effective_from, effective_to)
      VALUES (org,'__bad__',DATE '2024-01-01',DATE '2024-01-01');
    RAISE EXCEPTION 'FAIL: zero-length identity interval accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: zero-length identity applicability rejected (FR-019)'; END;
END $$;
ROLLBACK;

-- Identity independence from Name (FR-010): a Name edit does not touch identities.
BEGIN;
DO $$
DECLARE org uuid; before int;
BEGIN
  SELECT id INTO org FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  INSERT INTO organisation_identities (organisation_id, label) VALUES (org, '__id_indep__');
  SELECT count(*) INTO before FROM organisation_identities WHERE organisation_id=org;
  UPDATE organisations SET name = name || ' (edited)' WHERE id=org;   -- legacy name edit, canonical Name correction
  IF (SELECT count(*) FROM organisation_identities WHERE organisation_id=org) <> before THEN
    RAISE EXCEPTION 'FAIL: a Name change altered Identity rows';
  END IF;
  RAISE NOTICE 'PASS: Organisational Identity independent of Organisation Name (FR-010)';
END $$;
ROLLBACK;

-- ================================================================================
-- SECTION 3 - R05 Relationship types, facts, participants (rolled back)
-- ================================================================================
-- Valid membership relationship with two participants (deferred >=2 forced immediate).
BEGIN;
DO $$
DECLARE org1 uuid; org2 uuid; t uuid; rel uuid;
BEGIN
  SELECT id INTO org1 FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  SELECT id INTO org2 FROM organisations WHERE deleted_at IS NULL AND id<>org1 LIMIT 1;
  SELECT id INTO t FROM relationship_types WHERE key='membership';
  INSERT INTO organisation_relationships (type_id) VALUES (t) RETURNING id INTO rel;
  INSERT INTO organisation_relationship_participants (relationship_id, subject_id, subject_kind, participant_role)
    VALUES (rel, org1, 'organisation', 'member'), (rel, org2, 'organisation', 'body');
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE NOTICE 'PASS: membership relationship with two participants created (FR-001/013/018)';
END $$;
ROLLBACK;

-- Negative: fewer than two participants rejected (deferred trigger, forced immediate).
BEGIN;
DO $$
DECLARE org1 uuid; t uuid; rel uuid;
BEGIN
  SELECT id INTO org1 FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  SELECT id INTO t FROM relationship_types WHERE key='membership';
  INSERT INTO organisation_relationships (type_id) VALUES (t) RETURNING id INTO rel;
  INSERT INTO organisation_relationship_participants (relationship_id, subject_id, subject_kind, participant_role)
    VALUES (rel, org1, 'organisation', 'member');
  BEGIN
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'FAIL: relationship with one participant accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: relationship with fewer than two participants rejected (>=2 invariant)';
  END;
END $$;
ROLLBACK;

-- Negative: participant on a non-existent subject rejected (composite FK, subject integrity).
BEGIN;
DO $$
DECLARE t uuid; rel uuid;
BEGIN
  SELECT id INTO t FROM relationship_types WHERE key='membership';
  INSERT INTO organisation_relationships (type_id) VALUES (t) RETURNING id INTO rel;
  BEGIN
    INSERT INTO organisation_relationship_participants (relationship_id, subject_id, subject_kind)
      VALUES (rel, '00000000-0000-0000-0000-0000000000ab', 'organisation');
    RAISE EXCEPTION 'FAIL: participant on non-existent subject accepted';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: participant on non-existent subject rejected (FR-003/008)'; END;
END $$;
ROLLBACK;

-- Negative: OFFICE remains excluded from BP-03 (subject_kind CHECK).
BEGIN;
DO $$
DECLARE org1 uuid; t uuid; rel uuid;
BEGIN
  SELECT id INTO org1 FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  SELECT id INTO t FROM relationship_types WHERE key='membership';
  INSERT INTO organisation_relationships (type_id) VALUES (t) RETURNING id INTO rel;
  BEGIN
    INSERT INTO organisation_relationship_participants (relationship_id, subject_id, subject_kind)
      VALUES (rel, org1, 'organisational_office');
    RAISE EXCEPTION 'FAIL: office-kind participant accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: office-kind participant rejected, Office excluded (BP-04)'; END;
END $$;
ROLLBACK;

-- Predecessor/successor LINEAGE between two distinct subjects; duplicate participant rejected;
-- temporal overlap of distinct relationships allowed (FR-026/029/030/031).
-- NOTE: create BOTH relationships and ALL their participants while the deferred >=2 constraint
-- is still deferred, then force SET CONSTRAINTS ALL IMMEDIATE ONCE, after everything is populated.
-- (Forcing it earlier would reject the second bare relationship insert before its participants.)
BEGIN;
DO $$
DECLARE org1 uuid; org2 uuid; t uuid; rel uuid; rel2 uuid;
BEGIN
  SELECT id INTO org1 FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  SELECT id INTO org2 FROM organisations WHERE deleted_at IS NULL AND id<>org1 LIMIT 1;
  SELECT id INTO t FROM relationship_types WHERE key='lineage_predecessor_successor';

  -- First lineage relationship + its two participants (>=2 constraint still deferred).
  INSERT INTO organisation_relationships (type_id, effective_from) VALUES (t, DATE '2020-01-01') RETURNING id INTO rel;
  INSERT INTO organisation_relationship_participants (relationship_id, subject_id, subject_kind, participant_role)
    VALUES (rel, org1, 'organisation', 'predecessor'), (rel, org2, 'organisation', 'successor');

  -- Second, temporally overlapping lineage relationship + its two participants (still deferred).
  INSERT INTO organisation_relationships (type_id, effective_from) VALUES (t, DATE '2019-01-01') RETURNING id INTO rel2;
  INSERT INTO organisation_relationship_participants (relationship_id, subject_id, subject_kind, participant_role)
    VALUES (rel2, org1, 'organisation', 'predecessor'), (rel2, org2, 'organisation', 'successor');

  -- Both relationships are fully populated: force the deferred >=2 check once, for all rows.
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE NOTICE 'PASS: directed lineage (predecessor/successor) created between distinct subjects (FR-029/030)';
  RAISE NOTICE 'PASS: distinct overlapping relationships coexist, overlap is not duplication (FR-026/031)';

  -- Duplicate participant (same subject + role) rejected by the immediate UNIQUE constraint.
  BEGIN
    INSERT INTO organisation_relationship_participants (relationship_id, subject_id, subject_kind, participant_role)
      VALUES (rel, org1, 'organisation', 'predecessor');
    RAISE EXCEPTION 'FAIL: duplicate participant accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: duplicate participant rejected'; END;
END $$;
ROLLBACK;

-- Relationship Effective Applicability: reversed interval rejected; system type deletion protected.
BEGIN;
DO $$
DECLARE t uuid;
BEGIN
  SELECT id INTO t FROM relationship_types WHERE key='membership';
  BEGIN
    INSERT INTO organisation_relationships (type_id, effective_from, effective_to)
      VALUES (t, DATE '2024-01-01', DATE '2023-01-01');
    RAISE EXCEPTION 'FAIL: reversed relationship interval accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: reversed relationship applicability rejected (FR-022/023)'; END;

  BEGIN
    DELETE FROM relationship_types WHERE key='membership';
    RAISE EXCEPTION 'FAIL: system relationship type deleted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: system relationship type protected from deletion';
  END;
END $$;
ROLLBACK;

-- Arbitrary relationship without a defined type rejected (FR-002: type_id NOT NULL + FK).
BEGIN;
DO $$
BEGIN
  BEGIN
    INSERT INTO organisation_relationships (type_id) VALUES (NULL);
    RAISE EXCEPTION 'FAIL: relationship without a type accepted';
  EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'PASS: relationship requires a defined type (FR-002)'; END;
END $$;
ROLLBACK;

-- ================================================================================
-- SECTION 4 - Migration 156 atomic RPC (rolled back)
-- ================================================================================
-- Successful atomic creation (relationship + 2 participants in one call).
BEGIN;
DO $$
DECLARE org1 uuid; org2 uuid; t uuid; rel uuid; pc int;
BEGIN
  SELECT id INTO org1 FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  SELECT id INTO org2 FROM organisations WHERE deleted_at IS NULL AND id<>org1 LIMIT 1;
  SELECT id INTO t FROM relationship_types WHERE key='membership';
  rel := create_organisation_relationship(t, '__rpc_ok__', NULL, NULL,
    jsonb_build_array(
      jsonb_build_object('subjectId', org1::text, 'subjectKind','organisation','role','member'),
      jsonb_build_object('subjectId', org2::text, 'subjectKind','organisation','role','body')));
  SELECT count(*) INTO pc FROM organisation_relationship_participants WHERE relationship_id=rel;
  IF pc <> 2 THEN RAISE EXCEPTION 'FAIL: expected 2 participants, got %', pc; END IF;
  RAISE NOTICE 'PASS: RPC atomically created relationship % with 2 participants', rel;
END $$;
ROLLBACK;

-- Complete rollback when fewer than two participants (no orphan relationship row).
BEGIN;
DO $$
DECLARE org1 uuid; t uuid; before int; after int;
BEGIN
  SELECT id INTO org1 FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  SELECT id INTO t FROM relationship_types WHERE key='membership';
  SELECT count(*) INTO before FROM organisation_relationships;
  BEGIN
    PERFORM create_organisation_relationship(t, '__rpc_one__', NULL, NULL,
      jsonb_build_array(jsonb_build_object('subjectId', org1::text,'subjectKind','organisation','role','member')));
    RAISE EXCEPTION 'FAIL: RPC created a relationship with one participant';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: RPC rejected fewer than two participants';
  END;
  SELECT count(*) INTO after FROM organisation_relationships;
  IF after <> before THEN RAISE EXCEPTION 'FAIL: relationship persisted after failed RPC (no atomic rollback)'; END IF;
  RAISE NOTICE 'PASS: failed RPC (<2) left NO relationship row, complete rollback';
END $$;
ROLLBACK;

-- Complete rollback when a participant subject does not exist (composite FK).
BEGIN;
DO $$
DECLARE t uuid; before int; after int;
BEGIN
  SELECT id INTO t FROM relationship_types WHERE key='membership';
  SELECT count(*) INTO before FROM organisation_relationships;
  BEGIN
    PERFORM create_organisation_relationship(t, '__rpc_badsubj__', NULL, NULL,
      jsonb_build_array(
        jsonb_build_object('subjectId','00000000-0000-0000-0000-0000000000ab','subjectKind','organisation','role','member'),
        jsonb_build_object('subjectId','00000000-0000-0000-0000-0000000000ac','subjectKind','organisation','role','body')));
    RAISE EXCEPTION 'FAIL: RPC created a relationship with non-existent subjects';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: RPC rejected non-existent subject (FK)'; END;
  SELECT count(*) INTO after FROM organisation_relationships;
  IF after <> before THEN RAISE EXCEPTION 'FAIL: relationship persisted after FK failure'; END IF;
  RAISE NOTICE 'PASS: failed RPC (bad subject) left NO relationship row, complete rollback';
END $$;
ROLLBACK;

-- Complete rollback when the participant kind is ineligible (office, BP-04).
BEGIN;
DO $$
DECLARE org1 uuid; org2 uuid; t uuid; before int; after int;
BEGIN
  SELECT id INTO org1 FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  SELECT id INTO org2 FROM organisations WHERE deleted_at IS NULL AND id<>org1 LIMIT 1;
  SELECT id INTO t FROM relationship_types WHERE key='membership';
  SELECT count(*) INTO before FROM organisation_relationships;
  BEGIN
    PERFORM create_organisation_relationship(t, '__rpc_office__', NULL, NULL,
      jsonb_build_array(
        jsonb_build_object('subjectId', org1::text, 'subjectKind','organisation','role','member'),
        jsonb_build_object('subjectId', org2::text, 'subjectKind','organisational_office','role','body')));
    RAISE EXCEPTION 'FAIL: RPC accepted an office-kind participant';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: RPC rejected office-kind participant (Office is BP-04)'; END;
  SELECT count(*) INTO after FROM organisation_relationships;
  IF after <> before THEN RAISE EXCEPTION 'FAIL: relationship persisted after CHECK failure'; END IF;
  RAISE NOTICE 'PASS: failed RPC (office kind) left NO relationship row, complete rollback';
END $$;
ROLLBACK;

-- ================================================================================
-- SECTION 5 - Final data-preservation confirmation (read-only)
-- ================================================================================
-- BP-03 fact tables hold ONLY the seeded types and no stray data from this run (all rolled back).
-- Expect: identities 0, relationships 0, participants 0, relationship_types 2, and the two
-- internal organisations still type='internal' (PlayStation legacy item unchanged).
SELECT
  (SELECT count(*) FROM organisation_identities)                        AS identities,          -- expect 0
  (SELECT count(*) FROM organisation_relationships)                     AS relationships,       -- expect 0
  (SELECT count(*) FROM organisation_relationship_participants)         AS participants,        -- expect 0
  (SELECT count(*) FROM relationship_types)                             AS relationship_types,  -- expect 2 (unless you have added more)
  (SELECT count(*) FROM organisations WHERE type='internal')            AS internal_unchanged,  -- expect 2
  (SELECT count(*) FROM organisations)                                  AS organisations_final; -- expect 84
