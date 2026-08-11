-- ██ VERIFICATION ONLY — DO NOT APPLY AS A MIGRATION ██
--
-- Run AFTER migration 177 is applied. Every test is wrapped in BEGIN … ROLLBACK, so it mutates
-- NO production data. Proves the ORG-007 CF-001 atomicity RPCs leave NO partial state on failure,
-- and the CF-002 consistency mechanisms reject the invariant-violating writes at the authoritative
-- database boundary (correct under concurrent writers — see the lock notes). Actual SQLSTATEs are
-- caught; genuine unexpected errors still abort.
--
-- CONCURRENCY NOTE. The exclusion constraint (Part 2A) and the two Unit guard triggers (Part 2B)
-- are session-independent: they hold regardless of transaction interleaving. The soft-delete ↔
-- child-insert write-skew is additionally closed by a shared parent-row lock (the soft-delete
-- UPDATE and the child-placement trigger's SELECT … FOR NO KEY UPDATE contend on the same parent
-- row), so the two operations serialise. A single-session script cannot interleave two live
-- transactions; the tests below prove the authoritative rejection, and the lock behaviour is
-- asserted by construction in migration 177.

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- PART 1 — CF-001 atomicity (NFR-004)
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1A. record_organisation_name_change: atomic close→open success ───────────────
BEGIN;
DO $$
DECLARE subj uuid; prev_id uuid; res jsonb; primaries int;
BEGIN
  SELECT subject_id INTO subj FROM organisation_names
   WHERE is_primary AND deleted_at IS NULL AND subject_kind = 'organisation' LIMIT 1;
  SELECT id INTO prev_id FROM organisation_names WHERE subject_id = subj AND is_primary AND deleted_at IS NULL;

  res := record_organisation_name_change(subj, 'organisation', '__verify_new__', 'display', NULL, NULL, '2099-01-01');

  IF (SELECT is_primary FROM organisation_names WHERE id = prev_id) THEN
    RAISE EXCEPTION 'FAIL: prior primary was not closed';
  END IF;
  IF (SELECT effective_to FROM organisation_names WHERE id = prev_id) <> '2099-01-01' THEN
    RAISE EXCEPTION 'FAIL: prior primary not closed at the transition date';
  END IF;
  SELECT count(*) INTO primaries FROM organisation_names WHERE subject_id = subj AND is_primary AND deleted_at IS NULL;
  IF primaries <> 1 THEN RAISE EXCEPTION 'FAIL: expected exactly one primary, got %', primaries; END IF;
  IF (res->>'value') <> '__verify_new__' OR (res->>'is_primary')::boolean <> true THEN
    RAISE EXCEPTION 'FAIL: RPC did not return the new primary Name';
  END IF;
  RAISE NOTICE 'PASS 1A: name change closed prior + opened new primary atomically (one primary)';
END $$;
ROLLBACK;

-- ── 1B. record_organisation_name_change: COMPLETE rollback on failure (no partial state) ──
-- Force the INSERT to fail (invalid subject_kind violates the migration-151 CHECK) AFTER the
-- close would have run, and prove the prior primary is left intact — the former app path could
-- leave the subject with NO active primary here.
BEGIN;
DO $$
DECLARE subj uuid; prev_id uuid; still_primary boolean; still_open boolean;
BEGIN
  SELECT subject_id INTO subj FROM organisation_names
   WHERE is_primary AND deleted_at IS NULL AND subject_kind = 'organisation' LIMIT 1;
  SELECT id INTO prev_id FROM organisation_names WHERE subject_id = subj AND is_primary AND deleted_at IS NULL;
  BEGIN
    PERFORM record_organisation_name_change(subj, 'organisational_office', '__verify_bad__', 'display', NULL, NULL, '2099-01-01');
    RAISE EXCEPTION 'FAIL: RPC accepted an ineligible subject_kind';
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN
    RAISE NOTICE 'PASS 1B(i): invalid change rejected';
  END;
  SELECT is_primary, (effective_to IS NULL) INTO still_primary, still_open FROM organisation_names WHERE id = prev_id;
  IF NOT still_primary OR NOT still_open THEN
    RAISE EXCEPTION 'FAIL: prior primary was left closed after a failed change (PARTIAL STATE)';
  END IF;
  IF EXISTS (SELECT 1 FROM organisation_names WHERE subject_id = subj AND value = '__verify_bad__') THEN
    RAISE EXCEPTION 'FAIL: a new Name row persisted after a failed change';
  END IF;
  RAISE NOTICE 'PASS 1B(ii): failed change left the prior primary intact (no partial state)';
END $$;
ROLLBACK;

-- ── 1C. set_organisation_access_set: COMPLETE rollback on failure ─────────────────
-- A bad assignment (nonexistent organisation → FK violation) must roll back the WHOLE reconcile,
-- leaving the user's active access set exactly as it was (the former path could partially apply).
BEGIN;
DO $$
DECLARE u uuid; before_ids uuid[]; after_ids uuid[];
BEGIN
  SELECT user_id INTO u FROM user_organisation_access WHERE status = 'active'
   GROUP BY user_id ORDER BY count(*) DESC LIMIT 1;
  SELECT array_agg(organisation_id ORDER BY organisation_id) INTO before_ids
    FROM user_organisation_access WHERE user_id = u AND status = 'active';
  BEGIN
    PERFORM set_organisation_access_set(u, jsonb_build_array(
      jsonb_build_object('organisationId', '00000000-0000-0000-0000-0000000000ff', 'role', 'admin')));
    RAISE EXCEPTION 'FAIL: reconcile accepted a nonexistent organisation';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS 1C(i): reconcile with a bad org rejected';
  END;
  SELECT array_agg(organisation_id ORDER BY organisation_id) INTO after_ids
    FROM user_organisation_access WHERE user_id = u AND status = 'active';
  IF after_ids IS DISTINCT FROM before_ids THEN
    RAISE EXCEPTION 'FAIL: active access set changed after a failed reconcile (PARTIAL STATE)';
  END IF;
  RAISE NOTICE 'PASS 1C(ii): failed reconcile left the active access set unchanged';
END $$;
ROLLBACK;

-- ── 1D. sync_selected_study_authorisations: COMPLETE rollback on failure ──────────
-- A NULL study id (violates NOT NULL on resource_id) must roll back the DELETE too, so the prior
-- allow-set is NOT transiently emptied.
BEGIN;
DO $$
DECLARE u uuid; before_n int; after_n int;
BEGIN
  SELECT user_id INTO u FROM user_resource_authorisations
   WHERE resource_class = 'study' AND effect = 'allow' GROUP BY user_id LIMIT 1;
  IF u IS NULL THEN RAISE NOTICE 'SKIP 1D: no user currently holds a study allow-set'; RETURN; END IF;
  SELECT count(*) INTO before_n FROM user_resource_authorisations
   WHERE user_id = u AND resource_class = 'study' AND effect = 'allow';
  BEGIN
    PERFORM sync_selected_study_authorisations(u, ARRAY[NULL]::uuid[]);
    RAISE EXCEPTION 'FAIL: sync accepted a NULL study id';
  EXCEPTION WHEN not_null_violation THEN
    RAISE NOTICE 'PASS 1D(i): sync with a NULL study id rejected';
  END;
  SELECT count(*) INTO after_n FROM user_resource_authorisations
   WHERE user_id = u AND resource_class = 'study' AND effect = 'allow';
  IF after_n <> before_n THEN
    RAISE EXCEPTION 'FAIL: study allow-set changed after a failed sync (PARTIAL STATE), before=% after=%', before_n, after_n;
  END IF;
  RAISE NOTICE 'PASS 1D(ii): failed sync left the study allow-set unchanged (no transient empty)';
END $$;
ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- PART 2 — CF-002 concurrency-correct consistency (NFR-004)
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- ── 2A. Office attachment exclusivity (FR-010) enforced by the DB ─────────────────
BEGIN;
DO $$
DECLARE org uuid; off uuid;
BEGIN
  SELECT id INTO org FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  INSERT INTO organisation_offices (title) VALUES ('__verify_office__') RETURNING id INTO off;

  -- First (open-ended) attachment succeeds.
  INSERT INTO organisation_office_attachments (office_id, governing_organisation_id, effective_from, effective_to)
    VALUES (off, org, NULL, NULL);

  -- A second attachment overlapping the same point is REJECTED by the exclusion constraint.
  BEGIN
    INSERT INTO organisation_office_attachments (office_id, governing_organisation_id, effective_from, effective_to)
      VALUES (off, org, '2030-01-01', NULL);
    RAISE EXCEPTION 'FAIL: overlapping office attachment was accepted';
  EXCEPTION WHEN exclusion_violation THEN
    RAISE NOTICE 'PASS 2A(i): overlapping office attachment rejected (FR-010 at the DB)';
  END;
  RAISE NOTICE 'PASS 2A: office attachment exclusivity is authoritative in the database';
END $$;
ROLLBACK;

-- Non-overlapping (half-open, adjacent) attachments are allowed.
BEGIN;
DO $$
DECLARE org uuid; off uuid;
BEGIN
  SELECT id INTO org FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  INSERT INTO organisation_offices (title) VALUES ('__verify_office2__') RETURNING id INTO off;
  INSERT INTO organisation_office_attachments (office_id, governing_organisation_id, effective_from, effective_to)
    VALUES (off, org, '2020-01-01', '2025-01-01');
  -- Adjacent at the exclusive end (half-open [)) does NOT overlap → allowed.
  INSERT INTO organisation_office_attachments (office_id, governing_organisation_id, effective_from, effective_to)
    VALUES (off, org, '2025-01-01', NULL);
  RAISE NOTICE 'PASS 2A(ii): adjacent half-open attachments coexist (no false conflict)';
END $$;
ROLLBACK;

-- ── 2B. Unit removal ↔ live-children invariant enforced by the DB ─────────────────
BEGIN;
DO $$
DECLARE org uuid; parent uuid; child uuid;
BEGIN
  SELECT id INTO org FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  INSERT INTO organisation_units (organisation_id, name) VALUES (org, '__verify_parent__') RETURNING id INTO parent;
  INSERT INTO organisation_units (organisation_id, parent_unit_id, name) VALUES (org, parent, '__verify_child__') RETURNING id INTO child;

  -- Soft-deleting a parent that still has a live child is REJECTED.
  BEGIN
    UPDATE organisation_units SET deleted_at = now(), deleted_by = 'verify' WHERE id = parent;
    RAISE EXCEPTION 'FAIL: removed a unit that still has a live child';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS 2B(i): soft-delete blocked while a live child exists';
  END;

  -- Remove the child, then the parent removal succeeds.
  UPDATE organisation_units SET deleted_at = now(), deleted_by = 'verify' WHERE id = child;
  UPDATE organisation_units SET deleted_at = now(), deleted_by = 'verify' WHERE id = parent;
  RAISE NOTICE 'PASS 2B(ii): after removing the child, the parent removal succeeds';
END $$;
ROLLBACK;

-- Placing a LIVE unit under a REMOVED parent is rejected (both insert and re-parent).
BEGIN;
DO $$
DECLARE org uuid; removed_parent uuid; other uuid;
BEGIN
  SELECT id INTO org FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  INSERT INTO organisation_units (organisation_id, name) VALUES (org, '__verify_removed__') RETURNING id INTO removed_parent;
  UPDATE organisation_units SET deleted_at = now(), deleted_by = 'verify' WHERE id = removed_parent;  -- no children → allowed

  BEGIN
    INSERT INTO organisation_units (organisation_id, parent_unit_id, name) VALUES (org, removed_parent, '__verify_new_child__');
    RAISE EXCEPTION 'FAIL: inserted a live unit under a removed parent';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS 2B(iii): insert under a removed parent rejected';
  END;

  INSERT INTO organisation_units (organisation_id, name) VALUES (org, '__verify_other__') RETURNING id INTO other;
  BEGIN
    UPDATE organisation_units SET parent_unit_id = removed_parent WHERE id = other;
    RAISE EXCEPTION 'FAIL: re-parented a live unit under a removed parent';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS 2B(iv): re-parent under a removed parent rejected';
  END;
  RAISE NOTICE 'PASS 2B: the removed-unit ↔ live-children invariant is authoritative in the database';
END $$;
ROLLBACK;
