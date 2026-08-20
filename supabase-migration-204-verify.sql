-- Post-migration verification for 204. Run AFTER the migration, on its own.
--
-- RAISES an exception unless BOTH overloads exist with the correct grants and a
-- pinned search_path. A silent pass is not possible: either it prints the OK
-- notice, or it errors.

DO $verify$
DECLARE
  v_typed  oid;
  v_legacy oid;
  v_config text;
  v_fail   text := '';
BEGIN
  SELECT p.oid INTO v_typed FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='fx_submit_response_if_under_ceiling' AND p.pronargs=26;
  SELECT p.oid INTO v_legacy FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='fx_submit_response_if_under_ceiling' AND p.pronargs=3;

  IF v_typed  IS NULL THEN v_fail := v_fail || E'\n  - typed 26-argument overload MISSING'; END IF;
  IF v_legacy IS NULL THEN v_fail := v_fail || E'\n  - legacy 3-argument overload MISSING (204 must stay additive; 205 retires it)'; END IF;

  IF v_typed IS NOT NULL THEN
    IF pg_catalog.has_function_privilege('anon', v_typed, 'EXECUTE') THEN
      v_fail := v_fail || E'\n  - anon holds EXECUTE on the typed overload'; END IF;
    IF pg_catalog.has_function_privilege('authenticated', v_typed, 'EXECUTE') THEN
      v_fail := v_fail || E'\n  - authenticated holds EXECUTE on the typed overload'; END IF;
    IF NOT pg_catalog.has_function_privilege('service_role', v_typed, 'EXECUTE') THEN
      v_fail := v_fail || E'\n  - service_role LACKS EXECUTE on the typed overload'; END IF;

    SELECT pg_catalog.array_to_string(p.proconfig, ', ') INTO v_config FROM pg_proc p WHERE p.oid=v_typed;
    IF v_config IS NULL OR v_config NOT LIKE 'search_path=%' THEN
      v_fail := v_fail || E'\n  - search_path NOT pinned (proconfig = ' || coalesce(v_config,'<null>') || ')'; END IF;
  END IF;

  -- The legacy overload SHOULD still be anon-executable at this point. That is
  -- the exposure 205 closes; flagging it here would be a false alarm, so it is
  -- reported as information, not failure.
  IF v_legacy IS NOT NULL AND pg_catalog.has_function_privilege('anon', v_legacy, 'EXECUTE') THEN
    RAISE NOTICE 'Expected at this stage: the LEGACY overload is still anon-executable. Migration 205 revokes it.';
  END IF;

  IF v_fail <> '' THEN
    RAISE EXCEPTION 'M204 VERIFICATION FAILED:%', v_fail;
  END IF;

  RAISE NOTICE 'M204 VERIFIED: both overloads present; typed overload is service_role-only with % .', v_config;
END
$verify$;

-- Human-readable confirmation alongside the assertion above.
SELECT p.oid::regprocedure::text                                    AS signature,
       p.pronargs                                                   AS args,
       p.prosecdef                                                  AS security_definer,
       pg_catalog.array_to_string(p.proconfig, ', ')                AS search_path_setting,
       pg_catalog.has_function_privilege('anon',         p.oid,'EXECUTE') AS anon_exec,
       pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_exec,
       pg_catalog.has_function_privilege('service_role', p.oid,'EXECUTE') AS service_exec
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public' AND p.proname='fx_submit_response_if_under_ceiling'
 ORDER BY p.pronargs;
-- Expect exactly 2 rows:
--   3 args  (legacy) → proconfig NULL, anon_exec true   ← unchanged, 205 closes this
--  26 args  (typed)  → search_path pinned, anon_exec false, service_exec true
