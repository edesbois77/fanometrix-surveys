-- ██ VERIFICATION ONLY — DO NOT APPLY AS A MIGRATION ██
--
-- Run AFTER migrations 154, 155, 156 are applied. Every test is wrapped in BEGIN … ROLLBACK,
-- so it mutates NO production data. Proves the create_organisation_relationship RPC (156)
-- creates a relationship + its ≥2 participants ATOMICALLY, and that any invalid creation
-- rolls back the COMPLETE operation (no orphan relationship row). Actual SQLSTATE is caught;
-- genuine unexpected errors still abort.

-- ── 1. Successful atomic creation (relationship + 2 participants in one call) ────
BEGIN;
DO $$
DECLARE org1 uuid; org2 uuid; t uuid; rel uuid; pc int;
BEGIN
  SELECT id INTO org1 FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  SELECT id INTO org2 FROM organisations WHERE deleted_at IS NULL AND id<>org1 LIMIT 1;
  SELECT id INTO t FROM relationship_types WHERE key='membership';

  rel := create_organisation_relationship(
    t, '__rpc_ok__', NULL, NULL,
    jsonb_build_array(
      jsonb_build_object('subjectId', org1::text, 'subjectKind','organisation','role','member'),
      jsonb_build_object('subjectId', org2::text, 'subjectKind','organisation','role','body')
    ));

  SELECT count(*) INTO pc FROM organisation_relationship_participants WHERE relationship_id=rel;
  IF pc <> 2 THEN RAISE EXCEPTION 'FAIL: expected 2 participants, got %', pc; END IF;
  IF NOT EXISTS (SELECT 1 FROM organisation_relationships WHERE id=rel) THEN
    RAISE EXCEPTION 'FAIL: relationship not created';
  END IF;
  RAISE NOTICE 'PASS: RPC atomically created relationship % with 2 participants', rel;
END $$;
ROLLBACK;

-- ── 2. Complete rollback when the ≥2 invariant is violated (one participant) ─────
BEGIN;
DO $$
DECLARE org1 uuid; t uuid; before int; after int;
BEGIN
  SELECT id INTO org1 FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  SELECT id INTO t FROM relationship_types WHERE key='membership';
  SELECT count(*) INTO before FROM organisation_relationships;
  BEGIN
    PERFORM create_organisation_relationship(
      t, '__rpc_one__', NULL, NULL,
      jsonb_build_array(jsonb_build_object('subjectId', org1::text, 'subjectKind','organisation','role','member')));
    RAISE EXCEPTION 'FAIL: RPC created a relationship with only one participant';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: RPC rejected fewer than two participants';
  END;
  SELECT count(*) INTO after FROM organisation_relationships;
  IF after <> before THEN RAISE EXCEPTION 'FAIL: relationship row persisted after failed RPC (no atomic rollback)'; END IF;
  RAISE NOTICE 'PASS: failed RPC left NO relationship row (complete rollback)';
END $$;
ROLLBACK;

-- ── 3. Complete rollback when a participant subject does not exist (composite FK) ─
BEGIN;
DO $$
DECLARE t uuid; before int; after int;
BEGIN
  SELECT id INTO t FROM relationship_types WHERE key='membership';
  SELECT count(*) INTO before FROM organisation_relationships;
  BEGIN
    PERFORM create_organisation_relationship(
      t, '__rpc_badsubj__', NULL, NULL,
      jsonb_build_array(
        jsonb_build_object('subjectId','00000000-0000-0000-0000-0000000000ab','subjectKind','organisation','role','member'),
        jsonb_build_object('subjectId','00000000-0000-0000-0000-0000000000ac','subjectKind','organisation','role','body')));
    RAISE EXCEPTION 'FAIL: RPC created a relationship with non-existent subjects';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS: RPC rejected a non-existent participant subject (composite FK)';
  END;
  SELECT count(*) INTO after FROM organisation_relationships;
  IF after <> before THEN RAISE EXCEPTION 'FAIL: relationship row persisted after FK failure'; END IF;
  RAISE NOTICE 'PASS: failed RPC (bad subject) left NO relationship row (complete rollback)';
END $$;
ROLLBACK;

-- ── 4. Complete rollback when the subject kind is not eligible (office — BP-04) ──
BEGIN;
DO $$
DECLARE org1 uuid; org2 uuid; t uuid; before int; after int;
BEGIN
  SELECT id INTO org1 FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  SELECT id INTO org2 FROM organisations WHERE deleted_at IS NULL AND id<>org1 LIMIT 1;
  SELECT id INTO t FROM relationship_types WHERE key='membership';
  SELECT count(*) INTO before FROM organisation_relationships;
  BEGIN
    PERFORM create_organisation_relationship(
      t, '__rpc_office__', NULL, NULL,
      jsonb_build_array(
        jsonb_build_object('subjectId', org1::text, 'subjectKind','organisation','role','member'),
        jsonb_build_object('subjectId', org2::text, 'subjectKind','organisational_office','role','body')));
    RAISE EXCEPTION 'FAIL: RPC accepted an office-kind participant';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: RPC rejected an office-kind participant (Office is BP-04)';
  END;
  SELECT count(*) INTO after FROM organisation_relationships;
  IF after <> before THEN RAISE EXCEPTION 'FAIL: relationship persisted after CHECK failure'; END IF;
  RAISE NOTICE 'PASS: failed RPC (office kind) left NO relationship row (complete rollback)';
END $$;
ROLLBACK;
