-- Migration 212a: close two gaps in fx_campaign_group_cancel_revision
--
-- Status: HAND-APPLY. Corrective. Replaces ONE function; no schema change.
-- Follows migration 212, which is already applied. 212 is left as the historical
-- record of what was applied; this is the correction, so the audit trail stays
-- one-migration-one-step.
--
-- WHY
-- Verifying 212 in production turned up two things the cancel path got wrong.
-- Neither is reachable through the application today, and both were found by
-- reading and then testing the shipped function, not by review.
--
-- 1. NO owner_model GUARD. fx_campaign_group_edit refuses a legacy group
--    explicitly; the cancel function did not check at all. In practice a legacy
--    group holds no revisions, because the edit RPC is the only creation path —
--    but nothing at the schema level enforces that, and a direct INSERT can
--    create one. Demonstrated on non-production: a revision was attached to a
--    legacy group by direct INSERT, and the cancel function accepted it and set
--    cancelled_at. A guard must not depend on an invariant that only holds
--    because some other code path happens to be well behaved.
--
-- 2. A PRE-LOCK READ USED AFTER THE LOCK. The function read effective_at BEFORE
--    taking the group lock, then decided on that stale value. A revision that
--    became effective in between would have been cancelled on the strength of a
--    read taken before serialisation. Migration 211's freeze trigger would still
--    have refused the UPDATE — verified — but a guard should not rely on another
--    migration's backstop to reach the right answer.
--
-- 3. A SECOND CANCELLATION SILENTLY OVERWROTE THE FIRST. Cancelling an
--    already-cancelled revision succeeded and rewrote cancelled_at/cancelled_by,
--    destroying the record of who actually withdrew the change and when. The API
--    route happened to catch it first, so it was unreachable through the product
--    — but the function was the wrong place to be relying on that. It now raises,
--    and alters nothing.
--
-- All three are fixed by taking the lock first and re-reading, under the lock,
-- every value the function decides on — which is what fx_campaign_group_edit
-- already does.

BEGIN;

DO $preflight$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname='public' AND p.proname='fx_campaign_group_cancel_revision') THEN
    RAISE EXCEPTION 'M212a PRE-FLIGHT FAILED: migration 212 has not been applied. Nothing changed.';
  END IF;
  RAISE NOTICE 'M212a pre-flight OK.';
END
$preflight$;

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
  v_owner_model text;
  v_effective timestamptz;
  v_cancelled_at timestamptz;
  v_cancelled_by text;
BEGIN
  -- Resolve the owning group. Nothing read here is used for a DECISION; it only
  -- identifies which row to lock.
  SELECT r.group_id INTO v_group
    FROM public.campaign_group_revisions r WHERE r.id = p_revision_id;
  IF v_group IS NULL THEN
    RAISE EXCEPTION 'Revision % does not exist.', p_revision_id;
  END IF;

  -- SERIALISE on the group row, exactly as fx_campaign_group_edit does.
  SELECT g.owner_model INTO v_owner_model
    FROM public.campaign_groups g WHERE g.id = v_group FOR UPDATE;

  -- Gap 1: legacy groups are managed through the legacy path, never here.
  IF v_owner_model IS DISTINCT FROM 'survey_studio' THEN
    RAISE EXCEPTION 'Group % is not a Survey Studio group (owner_model=%). Legacy groups are managed through the legacy path.',
      v_group, v_owner_model;
  END IF;

  -- Gaps 2 and 3: re-read UNDER the lock every value this function decides on.
  SELECT r.effective_at, r.cancelled_at, r.cancelled_by
    INTO v_effective, v_cancelled_at, v_cancelled_by
    FROM public.campaign_group_revisions r WHERE r.id = p_revision_id;

  -- Gap 3. Checked BEFORE the effective_at test, because "already cancelled" is
  -- the more precise answer: a cancelled revision never took effect, so reporting
  -- it as "already effective" would be wrong as well as unhelpful.
  --
  -- This is also what makes concurrent cancellation safe. Two callers serialise
  -- on the group lock above; the second one re-reads here, sees the first one's
  -- cancelled_at, and raises. Without the re-read it would still hold the stale
  -- pre-lock NULL and would overwrite the first caller's record.
  --
  -- SQLSTATE 23505 (unique_violation) is raised deliberately so the API route can
  -- map this to HTTP 409 Conflict on the error code rather than by matching the
  -- message text, which would break the moment the wording changed.
  IF v_cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION
      'Revision % was already cancelled at % by %.', p_revision_id, v_cancelled_at, v_cancelled_by
      USING ERRCODE = '23505';
  END IF;

  IF v_effective <= now() THEN
    RAISE EXCEPTION 'Revision % is already effective and cannot be cancelled. Create a new revision instead.', p_revision_id;
  END IF;

  -- Cancelled revisions are RETAINED, preserving the record that a change was
  -- planned and withdrawn (criterion 56b).
  UPDATE public.campaign_group_revisions
     SET cancelled_at = now(), cancelled_by = p_cancelled_by
   WHERE id = p_revision_id
     -- Defence in depth: even if the guard above were removed, this predicate
     -- means the statement can never rewrite an existing cancellation.
     AND cancelled_at IS NULL;

  RETURN true;
END
$cancel$;

-- Re-apply the security contract. CREATE OR REPLACE preserves privileges, but
-- stating them again costs nothing and makes this file correct in isolation.
REVOKE ALL ON FUNCTION public.fx_campaign_group_cancel_revision(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fx_campaign_group_cancel_revision(uuid, text) TO service_role;

DO $assert$
DECLARE v_src text; v_oid oid;
BEGIN
  SELECT p.oid, p.prosrc INTO v_oid, v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='fx_campaign_group_cancel_revision';

  IF v_src NOT LIKE '%owner_model%' THEN
    RAISE EXCEPTION 'M212a FAILED: the cancel function still has no owner_model guard';
  END IF;
  IF v_src NOT LIKE '%survey_studio%' THEN
    RAISE EXCEPTION 'M212a FAILED: the cancel function does not pin owner_model to survey_studio';
  END IF;
  -- The lock must precede the effective_at read it decides on.
  IF position('FOR UPDATE' in v_src) > position('INTO v_effective' in v_src) THEN
    RAISE EXCEPTION 'M212a FAILED: effective_at is still read before the group lock';
  END IF;
  IF v_src NOT LIKE '%v_cancelled_at IS NOT NULL%' THEN
    RAISE EXCEPTION 'M212a FAILED: no already-cancelled guard';
  END IF;
  IF position('FOR UPDATE' in v_src) > position('INTO v_effective, v_cancelled_at' in v_src) THEN
    RAISE EXCEPTION 'M212a FAILED: cancelled_at is read before the group lock';
  END IF;
  IF v_src NOT LIKE '%AND cancelled_at IS NULL%' THEN
    RAISE EXCEPTION 'M212a FAILED: the UPDATE can still overwrite an existing cancellation';
  END IF;
  IF v_src NOT LIKE '%ERRCODE = ''23505''%' THEN
    RAISE EXCEPTION 'M212a FAILED: already-cancelled does not raise a mappable SQLSTATE';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) THEN
    RAISE EXCEPTION 'M212a FAILED: the cancel function is SECURITY DEFINER; INVOKER is required';
  END IF;
  IF has_function_privilege('anon', v_oid, 'EXECUTE')
     OR has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'M212a FAILED: anon or authenticated can EXECUTE the cancel function';
  END IF;
  IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'M212a FAILED: service_role cannot EXECUTE the cancel function';
  END IF;
  RAISE NOTICE 'M212a OK: cancel refuses legacy groups, refuses double-cancellation (23505), and decides only on post-lock reads.';
END
$assert$;

COMMIT;
