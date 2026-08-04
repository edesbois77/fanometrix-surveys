-- ██ VERIFICATION ONLY — DO NOT APPLY AS A MIGRATION ██
--
-- Run AFTER migrations 154–155 are applied. Every write test is wrapped in
-- BEGIN … ROLLBACK, so this mutates NO production data. Custom-guard failures are caught
-- by their ACTUAL SQLSTATE (P0001 = raise_exception; CHECK = check_violation; FK =
-- foreign_key_violation; UNIQUE = unique_violation); genuine unexpected errors still abort.
-- The deferred ≥2-participant constraint is forced with SET CONSTRAINTS ALL IMMEDIATE so it
-- can be exercised inside a rolled-back transaction. Read the NOTICEs (each prints PASS).

-- ── Read-only baseline / scope ──────────────────────────────────────────────────
-- Seeded system relationship types present (membership + lineage); expect 2.
SELECT count(*) AS system_types FROM relationship_types WHERE is_system;
-- No Identity/Relationship status or history columns (derived from applicability, never stored).
SELECT column_name FROM information_schema.columns
  WHERE table_name IN ('organisation_identities','organisation_relationships')
    AND column_name IN ('status','state','lifecycle','history','confidence','evidence','legal_identity');  -- expect 0 rows
-- Scope: no BP-04/BP-05 tables introduced (expect 0 rows).
SELECT table_name FROM information_schema.tables WHERE table_schema='public'
  AND table_name IN ('organisational_offices','office_holdings','organisation_authorities');

-- ══ R03 — Organisational Identity ═══════════════════════════════════════════════
BEGIN;
DO $$
DECLARE org uuid; id1 uuid; id2 uuid;
BEGIN
  SELECT id INTO org FROM organisations WHERE deleted_at IS NULL LIMIT 1;

  -- valid identity + MULTIPLE identities per organisation (FR-001/004)
  INSERT INTO organisation_identities (organisation_id, label) VALUES (org, '__identity_A__') RETURNING id INTO id1;
  INSERT INTO organisation_identities (organisation_id, label) VALUES (org, '__identity_B__') RETURNING id INTO id2;
  IF (SELECT count(*) FROM organisation_identities WHERE organisation_id=org AND deleted_at IS NULL) < 2 THEN
    RAISE EXCEPTION 'FAIL: organisation could not hold multiple identities';
  END IF;
  RAISE NOTICE 'PASS: identity created; multiple identities per organisation allowed';

  -- CORRECTION edits in place (same row, no fabricated history) — FR-015/016
  UPDATE organisation_identities SET label='__identity_A_corrected__' WHERE id=id1;
  IF (SELECT count(*) FROM organisation_identities WHERE id=id1) <> 1 THEN
    RAISE EXCEPTION 'FAIL: correction did not stay in place';
  END IF;
  RAISE NOTICE 'PASS: identity correction is in place (no new history row)';

  -- CHANGE: cease one identity (effective_to), commence a replacement — history retained (FR-012)
  UPDATE organisation_identities SET effective_to = CURRENT_DATE WHERE id=id2;   -- cessation
  INSERT INTO organisation_identities (organisation_id, label, effective_from) VALUES (org, '__identity_B2__', CURRENT_DATE);
  IF NOT EXISTS (SELECT 1 FROM organisation_identities WHERE id=id2 AND effective_to IS NOT NULL AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'FAIL: ceased identity not retained as history';
  END IF;
  RAISE NOTICE 'PASS: identity change ceases old (history kept) and commences new';

  -- applicability boundary: reversed / zero-length rejected (half-open) — FR-019
  BEGIN
    INSERT INTO organisation_identities (organisation_id, label, effective_from, effective_to)
      VALUES (org,'__bad__',DATE '2024-01-01',DATE '2024-01-01');
    RAISE EXCEPTION 'FAIL: zero-length identity interval accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: zero-length identity applicability rejected'; END;
END $$;
ROLLBACK;

-- Independence from Name (FR-010): editing an Organisation Name does not touch identities.
BEGIN;
DO $$
DECLARE org uuid; before int;
BEGIN
  SELECT id INTO org FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  INSERT INTO organisation_identities (organisation_id, label) VALUES (org, '__id_indep__');
  SELECT count(*) INTO before FROM organisation_identities WHERE organisation_id=org;
  UPDATE organisations SET name = name || ' (edited)' WHERE id=org;   -- legacy name edit → canonical Name correction
  IF (SELECT count(*) FROM organisation_identities WHERE organisation_id=org) <> before THEN
    RAISE EXCEPTION 'FAIL: a Name change altered Identity rows';
  END IF;
  RAISE NOTICE 'PASS: Organisational Identity is independent of Organisation Name';
END $$;
ROLLBACK;

-- ══ R05 — Relationships ═════════════════════════════════════════════════════════
-- Valid membership relationship with two participants (deferred ≥2 forced immediate).
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
  SET CONSTRAINTS ALL IMMEDIATE;   -- force the deferred ≥2 check now
  RAISE NOTICE 'PASS: membership relationship with two participants created';
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
    SET CONSTRAINTS ALL IMMEDIATE;   -- fires the deferred ≥2 check → P0001
    RAISE EXCEPTION 'FAIL: relationship with one participant accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: relationship with fewer than two participants rejected';
  END;
END $$;
ROLLBACK;

-- Negative: participant referencing a non-existent subject rejected (composite FK).
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
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: participant on non-existent subject rejected'; END;
END $$;
ROLLBACK;

-- Negative: office-kind participant rejected (CHECK — Office is BP-04).
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
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: office-kind participant rejected (Office is BP-04)'; END;
END $$;
ROLLBACK;

-- Directed lineage between two DISTINCT subjects with predecessor/successor roles (FR-029/030);
-- duplicate participant (same subject+role) rejected; temporal overlap of distinct relationships allowed.
BEGIN;
DO $$
DECLARE org1 uuid; org2 uuid; t uuid; rel uuid; rel2 uuid;
BEGIN
  SELECT id INTO org1 FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  SELECT id INTO org2 FROM organisations WHERE deleted_at IS NULL AND id<>org1 LIMIT 1;
  SELECT id INTO t FROM relationship_types WHERE key='lineage_predecessor_successor';

  INSERT INTO organisation_relationships (type_id, effective_from) VALUES (t, DATE '2020-01-01') RETURNING id INTO rel;
  INSERT INTO organisation_relationship_participants (relationship_id, subject_id, subject_kind, participant_role)
    VALUES (rel, org1, 'organisation', 'predecessor'), (rel, org2, 'organisation', 'successor');
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE NOTICE 'PASS: directed lineage relationship (predecessor/successor) created';

  -- duplicate participant (same subject + same role) rejected
  BEGIN
    INSERT INTO organisation_relationship_participants (relationship_id, subject_id, subject_kind, participant_role)
      VALUES (rel, org1, 'organisation', 'predecessor');
    RAISE EXCEPTION 'FAIL: duplicate participant accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: duplicate participant rejected'; END;

  -- a distinct, temporally overlapping relationship is allowed (FR-026)
  INSERT INTO organisation_relationships (type_id, effective_from) VALUES (t, DATE '2019-01-01') RETURNING id INTO rel2;
  INSERT INTO organisation_relationship_participants (relationship_id, subject_id, subject_kind, participant_role)
    VALUES (rel2, org1, 'organisation', 'predecessor'), (rel2, org2, 'organisation', 'successor');
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE NOTICE 'PASS: distinct overlapping relationships coexist (overlap is not duplication)';
END $$;
ROLLBACK;

-- Negative: reversed relationship applicability rejected; system type protected from deletion.
BEGIN;
DO $$
DECLARE t uuid;
BEGIN
  SELECT id INTO t FROM relationship_types WHERE key='membership';
  BEGIN
    INSERT INTO organisation_relationships (type_id, effective_from, effective_to)
      VALUES (t, DATE '2024-01-01', DATE '2023-01-01');
    RAISE EXCEPTION 'FAIL: reversed relationship interval accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: reversed relationship applicability rejected'; END;

  BEGIN
    DELETE FROM relationship_types WHERE key='membership';
    RAISE EXCEPTION 'FAIL: system relationship type deleted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: system relationship type protected from deletion';
  END;
END $$;
ROLLBACK;
