-- ██ VERIFICATION ONLY — DO NOT APPLY AS A MIGRATION ██
--
-- Run AFTER migrations 177 AND 178 are applied. Every test is wrapped in BEGIN … ROLLBACK, so it
-- mutates NO production data. Proves the migration-178 correction resolves the 42P01 defect: the
-- migration-177 RPCs now execute end-to-end through the nested canonical-Name triggers under the
-- pinned empty search_path, the one-way projection (governed behaviour) is still maintained, the
-- atomic-rollback guarantees still hold, and the legacy-write reroute still works.

-- ── A. The exact failing scenario (177-verify Part 1A) now SUCCEEDS, projection maintained ──
BEGIN;
DO $$
DECLARE subj uuid; res jsonb; projected text; primaries int;
BEGIN
  SELECT subject_id INTO subj FROM public.organisation_names
   WHERE is_primary AND deleted_at IS NULL AND subject_kind = 'organisation' LIMIT 1;

  res := record_organisation_name_change(subj, 'organisation', '__verify178_new__', 'display', NULL, NULL, '2099-01-01');

  -- No 42P01: the nested sync_name_projection ran under search_path=''. Projection followed.
  SELECT name INTO projected FROM public.organisations WHERE id = subj;
  IF projected <> '__verify178_new__' THEN
    RAISE EXCEPTION 'FAIL A: projection not updated to the new primary (got %)', projected;
  END IF;
  SELECT count(*) INTO primaries FROM public.organisation_names WHERE subject_id = subj AND is_primary AND deleted_at IS NULL;
  IF primaries <> 1 THEN RAISE EXCEPTION 'FAIL A: expected exactly one primary, got %', primaries; END IF;
  RAISE NOTICE 'PASS A: RPC name change succeeds under the fixed trigger; one primary; projection maintained';
END $$;
ROLLBACK;

-- ── B. Atomic-rollback guarantee still holds (177-verify Part 1B) ──
BEGIN;
DO $$
DECLARE subj uuid; prev_id uuid; still_primary boolean; still_open boolean;
BEGIN
  SELECT subject_id INTO subj FROM public.organisation_names
   WHERE is_primary AND deleted_at IS NULL AND subject_kind = 'organisation' LIMIT 1;
  SELECT id INTO prev_id FROM public.organisation_names WHERE subject_id = subj AND is_primary AND deleted_at IS NULL;
  BEGIN
    PERFORM record_organisation_name_change(subj, 'organisational_office', '__verify178_bad__', 'display', NULL, NULL, '2099-01-01');
    RAISE EXCEPTION 'FAIL B: RPC accepted an ineligible subject_kind';
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN
    RAISE NOTICE 'PASS B(i): invalid change rejected';
  END;
  SELECT is_primary, (effective_to IS NULL) INTO still_primary, still_open FROM public.organisation_names WHERE id = prev_id;
  IF NOT still_primary OR NOT still_open THEN RAISE EXCEPTION 'FAIL B: prior primary left closed (PARTIAL STATE)'; END IF;
  RAISE NOTICE 'PASS B(ii): failed change left the prior primary intact (no partial state)';
END $$;
ROLLBACK;

-- ── C. Access-set reconcile RPC executes end-to-end (its BEFORE-UPDATE trigger is safe) ──
BEGIN;
DO $$
DECLARE u uuid; ids uuid[];
BEGIN
  SELECT user_id INTO u FROM public.user_organisation_access WHERE status='active' GROUP BY user_id LIMIT 1;
  IF u IS NULL THEN RAISE NOTICE 'SKIP C: no active access rows'; RETURN; END IF;
  SELECT array_agg(organisation_id) INTO ids FROM public.user_organisation_access WHERE user_id=u AND status='active';
  -- Reconcile to the SAME set (idempotent) — exercises upsert + the set_updated_at BEFORE UPDATE.
  PERFORM set_organisation_access_set(u, (
    SELECT jsonb_agg(jsonb_build_object('organisationId', oa.organisation_id, 'role', oa.role))
    FROM public.user_organisation_access oa WHERE oa.user_id=u AND oa.status='active'));
  RAISE NOTICE 'PASS C: set_organisation_access_set executed end-to-end (no search_path error)';
END $$;
ROLLBACK;

-- ── D. Study-authorisation sync RPC executes end-to-end ──
BEGIN;
DO $$
DECLARE u uuid; ids uuid[];
BEGIN
  SELECT user_id INTO u FROM public.user_resource_authorisations
   WHERE resource_class='study' AND effect='allow' GROUP BY user_id LIMIT 1;
  IF u IS NULL THEN RAISE NOTICE 'SKIP D: no study allow-set'; RETURN; END IF;
  SELECT array_agg(resource_id) INTO ids FROM public.user_resource_authorisations
   WHERE user_id=u AND resource_class='study' AND effect='allow';
  PERFORM sync_selected_study_authorisations(u, ids);
  RAISE NOTICE 'PASS D: sync_selected_study_authorisations executed end-to-end';
END $$;
ROLLBACK;

-- ── E. Governed behaviour intact: a legacy display-column write still reroutes to canonical ──
BEGIN;
DO $$
DECLARE subj uuid; canon text;
BEGIN
  SELECT subject_id INTO subj FROM public.organisation_names
   WHERE is_primary AND deleted_at IS NULL AND subject_kind = 'organisation' LIMIT 1;
  UPDATE public.organisations SET name = '__verify178_legacy__' WHERE id = subj;   -- legacy direct write
  SELECT value INTO canon FROM public.organisation_names WHERE subject_id = subj AND is_primary AND deleted_at IS NULL;
  IF canon <> '__verify178_legacy__' THEN
    RAISE EXCEPTION 'FAIL E: legacy write did not reroute to the canonical primary Name (got %)', canon;
  END IF;
  RAISE NOTICE 'PASS E: legacy display-column write still reroutes to canonical (correction) after hardening';
END $$;
ROLLBACK;
