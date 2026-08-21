-- Migration 211: freeze effective revisions
--
-- Status: HAND-APPLY. Additive — triggers only.
-- WP1 design refs: M3b · §3.8.3b · criteria 13, 55, 56, 56a.
--
-- An EFFECTIVE revision (effective_at <= now()) and its member rows are frozen
-- forever. A PENDING one stays freely editable, so a scheduled change can be
-- revised, superseded or cancelled right up to its boundary.
--
-- THE MEMBER TRIGGER COVERS INSERT AS WELL AS UPDATE AND DELETE.
-- An earlier draft covered only UPDATE and DELETE, which left the freeze
-- guarantee false in the one direction that matters most: a row could still be
-- ADDED to an already-effective revision, retroactively changing what that
-- configuration says. Worse, the added row was then itself frozen, so the
-- mistake was unrecoverable. Verified against a real revision before this was
-- corrected, not reasoned about.
--
-- INSERT cannot be blocked outright, because the legitimate write path builds a
-- revision and its members in ONE transaction: an immediate edit (effective_at =
-- now()) is already effective when its members land. The rule is therefore
-- narrower than "no inserts": a member may be inserted into an effective
-- revision only while that revision is still BEING BUILT.
--
-- "Still being built" is decided by an UNFORGEABLE, TRANSACTION-SCOPED FACT:
-- whether the parent revision row has committed yet.
--
--   NOT pg_visible_in_snapshot(r.xmin, pg_current_snapshot())
--
-- `xmin` is the system-assigned inserting transaction id. No caller can set it,
-- and it is not a column anyone can write. A row that has not yet committed is
-- invisible in the current snapshot, which is true for the transaction that
-- inserted it AND for any subtransaction of it; a row from any earlier committed
-- transaction is visible, and is refused.
--
-- An earlier draft tested the parent's `created_at` against transaction_timestamp().
-- That was FORGEABLE and was demonstrated to be so: a revision inserted with
-- created_at = now() + 10 years stayed "recently created" forever, so any later
-- transaction could keep adding members to an effective configuration. created_at
-- is caller-supplied data and carries no authority. `xmin` is engine state.
--
-- Subtransactions are handled: `xmin` on its own would not be, because a row
-- inserted inside a plpgsql EXCEPTION block carries the SUBtransaction's id and
-- would not equal pg_current_xact_id(). Snapshot visibility is correct for both.
--
-- Enforced by trigger, NOT by application code: a configuration that governed a
-- serve must be reconstructable identically forever, and application-level
-- discipline is one forgotten code path away from failing that.

BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.campaign_group_revisions') IS NULL
     OR to_regclass('public.campaign_group_revision_members') IS NULL THEN
    RAISE EXCEPTION 'M211 PRE-FLIGHT FAILED: migration 210 has not been applied. Nothing changed.';
  END IF;
  RAISE NOTICE 'M211 pre-flight OK.';
END
$preflight$;

CREATE OR REPLACE FUNCTION public.fx_cgr_freeze_effective()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $freeze$
DECLARE
  v_old_effective timestamptz;
BEGIN
  v_old_effective := OLD.effective_at;

  IF v_old_effective <= now() THEN
    -- Cancellation of an ALREADY-EFFECTIVE revision is not a correction, it is a
    -- rewrite of history: sessions were served under it.
    RAISE EXCEPTION
      'Revision % is effective (since %) and is frozen. Create a NEW revision instead; effective configurations are never edited, cancelled or deleted.',
      OLD.id, v_old_effective;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$freeze$;

CREATE OR REPLACE FUNCTION public.fx_cgrm_freeze_effective()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $freezem$
DECLARE
  v_rev_id uuid;
  v_effective timestamptz;
  v_parent_committed boolean;
BEGIN
  v_rev_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.revision_id ELSE NEW.revision_id END;

  -- `xmin` is engine state, not data: it cannot be supplied, updated or forged.
  SELECT r.effective_at,
         pg_visible_in_snapshot(r.xmin::text::xid8, pg_current_snapshot())
    INTO v_effective, v_parent_committed
    FROM public.campaign_group_revisions r WHERE r.id = v_rev_id;

  -- Parent gone (a CASCADE delete from a pending revision) or not yet effective:
  -- both are legitimate and must not be blocked.
  IF v_effective IS NULL OR v_effective > now() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- The parent is effective. The ONLY legitimate write is an INSERT belonging to
  -- the transaction still constructing that revision — see the header.
  IF TG_OP = 'INSERT' AND NOT v_parent_committed THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Member rows of revision % are frozen (effective since %). Create a NEW revision instead.',
    v_rev_id, v_effective;
END
$freezem$;

DROP TRIGGER IF EXISTS cgr_freeze_effective  ON public.campaign_group_revisions;
CREATE TRIGGER cgr_freeze_effective
  BEFORE UPDATE OR DELETE ON public.campaign_group_revisions
  FOR EACH ROW EXECUTE FUNCTION public.fx_cgr_freeze_effective();

DROP TRIGGER IF EXISTS cgrm_freeze_effective ON public.campaign_group_revision_members;
CREATE TRIGGER cgrm_freeze_effective
  BEFORE INSERT OR UPDATE OR DELETE ON public.campaign_group_revision_members
  FOR EACH ROW EXECUTE FUNCTION public.fx_cgrm_freeze_effective();

REVOKE ALL ON FUNCTION public.fx_cgr_freeze_effective()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fx_cgrm_freeze_effective() FROM PUBLIC, anon, authenticated;

DO $assert$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.campaign_group_revisions'::regclass
                   AND tgname='cgr_freeze_effective') THEN
    RAISE EXCEPTION 'M211 FAILED: revision freeze trigger missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.campaign_group_revision_members'::regclass
                   AND tgname='cgrm_freeze_effective') THEN
    RAISE EXCEPTION 'M211 FAILED: member freeze trigger missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='fx_cgr_freeze_effective'
                    AND array_to_string(p.proconfig,',') LIKE 'search_path=%') THEN
    RAISE EXCEPTION 'M211 FAILED: search_path not pinned on the freeze function';
  END IF;
  -- The member trigger MUST cover INSERT. Without it the freeze guarantee is
  -- false in the one direction that cannot be undone. tgtype bit 2 = INSERT.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid='public.campaign_group_revision_members'::regclass
                    AND tgname='cgrm_freeze_effective'
                    AND (tgtype & 4) > 0) THEN
    RAISE EXCEPTION 'M211 FAILED: the member freeze trigger does not cover INSERT — a row could still be added to an effective revision';
  END IF;
  -- The construction test must rest on engine state, never on caller-supplied
  -- data. A created_at comparison here was proven forgeable; refuse to ship one.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='fx_cgrm_freeze_effective'
                    AND p.prosrc LIKE '%pg_visible_in_snapshot%') THEN
    RAISE EXCEPTION 'M211 FAILED: the member freeze does not use snapshot visibility';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public' AND p.proname='fx_cgrm_freeze_effective'
                AND p.prosrc LIKE '%transaction_timestamp%') THEN
    RAISE EXCEPTION 'M211 FAILED: the member freeze compares a caller-supplied timestamp — that rule is forgeable';
  END IF;
  RAISE NOTICE 'M211 OK: effective revisions frozen; member INSERT/UPDATE/DELETE gated on unforgeable snapshot visibility.';
END
$assert$;

COMMIT;
