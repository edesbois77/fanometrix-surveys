-- Migration 212: the edit RPC
--
-- Status: HAND-APPLY. Additive — one function.
-- WP1 design refs: M3c · §3.8.3c · criteria 45-49, 53, 54, 57a, 59.
--
-- WHY AN RPC AT ALL
-- A configuration edit is: create a revision, copy the previous member set,
-- apply the delta, validate the cap — atomically, or not at all. PostgREST cannot
-- express a multi-statement transaction, so this has to live in the database.
--
-- SERIALISATION: `SELECT … FOR UPDATE` on the group row, taken first.
-- The lock's lifetime is exactly the transaction's, it releases on rollback with
-- no bookkeeping, it cannot collide across unrelated keys the way a hashed
-- advisory key can, and during an incident it is visible in pg_locks against a
-- real row. A concurrent edit BLOCKS, then re-resolves its base revision AFTER
-- acquiring the lock — so edits stack rather than race (criterion 59).
--
-- SECURITY INVOKER, deliberately: the only caller holds the service role, which
-- bypasses RLS anyway, so DEFINER would add no capability — while INVOKER keeps
-- RLS as an independent second gate if EXECUTE is ever widened by accident.
--
-- NOTE ON QUALIFICATION: object references are schema-qualified; SQL CONSTRUCTS
-- (coalesce, nullif, greatest, least, case) are NOT — they are not catalog
-- functions and qualifying them raises 42883 at runtime. That mistake shipped a
-- live defect in migration 204.

BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.campaign_group_revisions') IS NULL
     OR to_regclass('public.campaign_group_revision_members') IS NULL THEN
    RAISE EXCEPTION 'M212 PRE-FLIGHT FAILED: migration 210 has not been applied. Nothing changed.';
  END IF;
  RAISE NOTICE 'M212 pre-flight OK.';
END
$preflight$;

CREATE OR REPLACE FUNCTION public.fx_campaign_group_edit(
  p_group_id        uuid,
  p_effective_at    timestamptz,
  p_rotation        text,
  p_members         jsonb,          -- [{campaign_id, weight, priority, membership_state}, …] COMPLETE set
  p_change_kind     text,
  p_change_reason   text,
  p_created_by      text,
  p_active_limit    integer DEFAULT NULL,   -- NULL = inherit from the base revision
  p_comparability_ack boolean DEFAULT false,
  p_based_on        uuid    DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $edit$
DECLARE
  v_locked        uuid;
  v_owner_model   text;
  v_base_id       uuid;
  v_limit         integer;
  v_new_id        uuid;
  v_active_count  integer;
  v_member        jsonb;
  v_has_evidence  boolean;
BEGIN
  -- 1. SERIALISE. Everything below re-resolves AFTER this returns.
  SELECT id, owner_model INTO v_locked, v_owner_model
    FROM public.campaign_groups
   WHERE id = p_group_id
     FOR UPDATE;

  IF v_locked IS NULL THEN
    RAISE EXCEPTION 'Group % does not exist.', p_group_id;
  END IF;
  IF v_owner_model <> 'survey_studio' THEN
    RAISE EXCEPTION 'Group % is not a Survey Studio group (owner_model=%). Legacy groups are edited through the legacy path and are not touched by this function.',
      p_group_id, v_owner_model;
  END IF;

  -- 2. Resolve the base revision under the lock.
  IF p_based_on IS NOT NULL THEN
    v_base_id := p_based_on;
  ELSE
    SELECT r.id INTO v_base_id
      FROM public.campaign_group_revisions r
     WHERE r.group_id = p_group_id AND r.cancelled_at IS NULL
     ORDER BY r.effective_at DESC, r.created_at DESC, r.id DESC
     LIMIT 1;
  END IF;

  v_limit := p_active_limit;
  IF v_limit IS NULL THEN
    SELECT r.active_member_limit INTO v_limit
      FROM public.campaign_group_revisions r WHERE r.id = v_base_id;
  END IF;
  v_limit := coalesce(v_limit, 20);

  -- 3. Comparability acknowledgement, required once a group has recorded evidence
  --    (criterion 54). Membership changes alter the population being measured.
  IF p_change_kind IN ('members_added','members_removed') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.campaign_group_revisions r
       WHERE r.group_id = p_group_id AND r.effective_at <= now() AND r.cancelled_at IS NULL
    ) INTO v_has_evidence;
    IF v_has_evidence AND NOT p_comparability_ack THEN
      RAISE EXCEPTION 'Membership change on a group with recorded configuration history requires an explicit comparability acknowledgement.';
    END IF;
  END IF;

  IF p_change_reason IS NULL AND p_change_kind IN ('members_added','members_removed') THEN
    RAISE EXCEPTION 'A reason is required for live admissions and removals.';
  END IF;

  -- 4. Create the revision.
  INSERT INTO public.campaign_group_revisions
    (group_id, effective_at, rotation, active_member_limit, based_on_revision_id,
     change_kind, change_reason, comparability_ack, created_by)
  VALUES
    (p_group_id, p_effective_at, p_rotation, v_limit, v_base_id,
     p_change_kind, p_change_reason, p_comparability_ack, p_created_by)
  RETURNING id INTO v_new_id;

  -- 5. Write the COMPLETE member set. Callers always send the full set; unchanged
  --    members are copied by the caller from the base revision, which is what
  --    makes each revision self-contained (criterion 54, second block).
  FOR v_member IN SELECT * FROM jsonb_array_elements(p_members) LOOP
    INSERT INTO public.campaign_group_revision_members
      (revision_id, campaign_id, weight, priority, membership_state)
    VALUES (
      v_new_id,
      (v_member->>'campaign_id')::uuid,
      coalesce((v_member->>'weight')::integer, 1),
      coalesce((v_member->>'priority')::integer, 100),
      coalesce(v_member->>'membership_state', 'active')
    );
  END LOOP;

  -- 6. Cap validated PER REVISION — an O(1) count over one member set, not an
  --    interval sweep. Paused members do not count (criterion 44).
  SELECT count(*) INTO v_active_count
    FROM public.campaign_group_revision_members m
   WHERE m.revision_id = v_new_id AND m.membership_state = 'active';

  IF v_active_count > v_limit THEN
    RAISE EXCEPTION
      'Revision % would have % active members, over the limit of %. Pause or remove members, or raise the limit.',
      v_new_id, v_active_count, v_limit;
  END IF;

  -- 7. Every non-cancelled PENDING revision must also respect the cap, including
  --    when the limit itself is lowered (criterion 57b).
  IF EXISTS (
    SELECT 1
      FROM public.campaign_group_revisions r
      JOIN public.campaign_group_revision_members m ON m.revision_id = r.id
     WHERE r.group_id = p_group_id AND r.cancelled_at IS NULL AND r.effective_at > now()
       AND m.membership_state = 'active'
     GROUP BY r.id, r.active_member_limit
    HAVING count(*) > r.active_member_limit
  ) THEN
    RAISE EXCEPTION 'A pending revision for this group would exceed its active-member limit. Resolve it before this edit.';
  END IF;

  RETURN v_new_id;
END
$edit$;

CREATE OR REPLACE FUNCTION public.fx_campaign_group_cancel_revision(
  p_revision_id uuid,
  p_cancelled_by text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $cancel$
DECLARE
  v_group uuid;
  v_effective timestamptz;
  v_locked uuid;
BEGIN
  SELECT r.group_id, r.effective_at INTO v_group, v_effective
    FROM public.campaign_group_revisions r WHERE r.id = p_revision_id;
  IF v_group IS NULL THEN
    RAISE EXCEPTION 'Revision % does not exist.', p_revision_id;
  END IF;

  SELECT id INTO v_locked FROM public.campaign_groups WHERE id = v_group FOR UPDATE;

  IF v_effective <= now() THEN
    RAISE EXCEPTION 'Revision % is already effective and cannot be cancelled. Create a new revision instead.', p_revision_id;
  END IF;

  -- Cancelled revisions are RETAINED, preserving the record that a change was
  -- planned and withdrawn (criterion 56b).
  UPDATE public.campaign_group_revisions
     SET cancelled_at = now(), cancelled_by = p_cancelled_by
   WHERE id = p_revision_id;

  RETURN true;
END
$cancel$;

-- ── Security contract (§4) ───────────────────────────────────────────────────
DO $revoke$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('fx_campaign_group_edit','fx_campaign_group_cancel_revision')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END
$revoke$;

DO $assert$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure::text AS sig, p.prosecdef,
           array_to_string(p.proconfig, ',') AS cfg
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('fx_campaign_group_edit','fx_campaign_group_cancel_revision')
  LOOP
    n := n + 1;
    IF r.prosecdef THEN
      RAISE EXCEPTION 'M212 FAILED: % is SECURITY DEFINER; INVOKER is required so RLS stays a second gate', r.sig;
    END IF;
    IF r.cfg IS NULL OR r.cfg NOT LIKE 'search_path=%' THEN
      RAISE EXCEPTION 'M212 FAILED: search_path not pinned on %', r.sig;
    END IF;
    IF has_function_privilege('anon', r.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'M212 FAILED: anon or authenticated can EXECUTE %', r.sig;
    END IF;
    IF NOT has_function_privilege('service_role', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'M212 FAILED: service_role cannot EXECUTE % — the edit API could not function', r.sig;
    END IF;
  END LOOP;
  IF n <> 2 THEN
    RAISE EXCEPTION 'M212 FAILED: expected 2 edit functions, found %', n;
  END IF;
  RAISE NOTICE 'M212 OK: 2 functions, INVOKER, search_path pinned, service_role-only EXECUTE.';
END
$assert$;

COMMIT;
