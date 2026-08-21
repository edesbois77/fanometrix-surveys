-- Rollback for Migration 212a. Restores the migration-212 cancel function
-- VERBATIM, copied from supabase-migration-212.sql rather than retyped, so a
-- post-rollback hash matches what 212 originally installed.
--
-- NOTE: this reintroduces all three gaps 212a closed — no owner_model guard, a
-- pre-lock read used for the effective_at decision, and a second cancellation
-- silently overwriting the first. Roll back only if 212a itself causes a
-- problem, never as tidying.
BEGIN;

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

REVOKE ALL ON FUNCTION public.fx_campaign_group_cancel_revision(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fx_campaign_group_cancel_revision(uuid, text) TO service_role;
COMMIT;
