-- Migration 177 — ORG-007 CF-001 / CF-002: atomic Organisations mutations + concurrency-correct consistency
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- ⚠ HAND-APPLIED, per project practice. NOT applied by any automated process. Additive,
-- reversible, idempotent. Introduces NO new domain concept, table, or governed semantic — it
-- provides ATOMIC/NON-PARTIAL execution and CONCURRENCY-CORRECT enforcement for behaviour that
-- already exists in the application layer (ORG-004/005/006), moving the integrity boundary to the
-- database where it remains correct under interruption and concurrent writers.
--
-- ── PRE-APPLY VALIDATION (MIGRATION-VALIDATION-CHECKLIST.md) ─────────────────────────────────
-- The office exclusion constraint (Part 2A) will REFUSE to be added if existing data already
-- violates FR-010 (two live attachments of one Office overlapping in time). BEFORE applying, run:
--     SELECT a.office_id, a.id, b.id
--     FROM organisation_office_attachments a
--     JOIN organisation_office_attachments b
--       ON a.office_id = b.office_id AND a.id < b.id
--      AND a.deleted_at IS NULL AND b.deleted_at IS NULL
--      AND daterange(a.effective_from, a.effective_to, '[)') && daterange(b.effective_from, b.effective_to, '[)');
-- Expect ZERO rows. Any row is a pre-existing inconsistency for business-judgement correction
-- BEFORE this migration (do not weaken the constraint to accommodate bad data).
-- Likewise confirm no live Unit currently sits under a soft-deleted parent (Part 2B assumes the
-- existing invariant already holds):
--     SELECT c.id FROM organisation_units c JOIN organisation_units p ON p.id = c.parent_unit_id
--     WHERE c.deleted_at IS NULL AND p.deleted_at IS NOT NULL;  -- expect ZERO rows

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- PART 1 — CF-001: ATOMIC / NON-PARTIAL MUTATION (NFR-004)
-- Each function performs a multi-statement mutation inside ONE transaction with NO EXCEPTION
-- handler, so any failure/interruption rolls the COMPLETE operation back — no partial state.
-- SECURITY INVOKER (no privilege elevation) + pinned empty search_path (all objects qualified).
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- 1A — Genuine Name change (close current primary → open new primary) ATOMICALLY.
-- Replaces the application's non-transactional close→open + best-effort revert. The current
-- primary is locked FOR UPDATE so concurrent changes serialise; the one-primary index
-- (migration 151) still guarantees at most one primary. Returns the new Name row as jsonb.
CREATE OR REPLACE FUNCTION public.record_organisation_name_change(
  p_subject_id      uuid,
  p_subject_kind    text,
  p_value           text,
  p_name_form       text,
  p_language        text,
  p_script          text,
  p_transition_date date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_prev_id uuid;
  v_new_id  uuid;
  v_result  jsonb;
BEGIN
  -- Lock the current primary (if any) so a concurrent change to the same subject serialises.
  SELECT id INTO v_prev_id
    FROM public.organisation_names
   WHERE subject_id = p_subject_id AND is_primary AND deleted_at IS NULL
   LIMIT 1
   FOR UPDATE;

  IF v_prev_id IS NOT NULL THEN
    UPDATE public.organisation_names
       SET is_primary = false, effective_to = p_transition_date
     WHERE id = v_prev_id;
  END IF;

  INSERT INTO public.organisation_names
    (subject_id, subject_kind, value, name_form, language, script, is_primary, effective_from, effective_to)
  VALUES
    (p_subject_id, p_subject_kind, p_value, COALESCE(p_name_form, 'display'), p_language, p_script, true, p_transition_date, NULL)
  RETURNING id INTO v_new_id;

  SELECT to_jsonb(n.*) INTO v_result FROM public.organisation_names n WHERE n.id = v_new_id;
  RETURN v_result;
END $$;

-- 1B — Reconcile the governed Organisation Access SET to EXACTLY the supplied assignments
-- ATOMICALLY (upsert desired + revoke non-desired in one transaction). Replaces the
-- application's upsert→select→revoke multi-statement sequence (partial-state window). Empty
-- assignments → revoke all active (the governed "no organisation" state). No permission union.
CREATE OR REPLACE FUNCTION public.set_organisation_access_set(
  p_user_id      uuid,
  p_assignments  jsonb   -- [{ "organisationId": uuid, "role": text }, ...]
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_assignments IS NULL OR jsonb_array_length(p_assignments) = 0 THEN
    UPDATE public.user_organisation_access
       SET status = 'revoked'
     WHERE user_id = p_user_id AND status = 'active';
    RETURN;
  END IF;

  -- Grant/retain every desired association ACTIVE (upsert on the (user, org) key).
  INSERT INTO public.user_organisation_access (user_id, organisation_id, role, status)
  SELECT p_user_id, (a->>'organisationId')::uuid, a->>'role', 'active'
    FROM jsonb_array_elements(p_assignments) AS a
  ON CONFLICT (user_id, organisation_id)
  DO UPDATE SET role = EXCLUDED.role, status = 'active';

  -- Revoke ONLY active associations NOT in the desired set (never the maintained ones).
  UPDATE public.user_organisation_access
     SET status = 'revoked'
   WHERE user_id = p_user_id AND status = 'active'
     AND organisation_id NOT IN (
       SELECT (a->>'organisationId')::uuid FROM jsonb_array_elements(p_assignments) AS a
     );
END $$;

-- 1C — Reconcile the Selected-Study URA allow-set ATOMICALLY (delete + insert in one
-- transaction). Replaces the application's DELETE→INSERT window that could transiently empty
-- the allow-set on interruption.
CREATE OR REPLACE FUNCTION public.sync_selected_study_authorisations(
  p_user_id   uuid,
  p_study_ids uuid[]
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.user_resource_authorisations
   WHERE user_id = p_user_id AND resource_class = 'study' AND effect = 'allow';

  IF p_study_ids IS NOT NULL AND array_length(p_study_ids, 1) IS NOT NULL THEN
    INSERT INTO public.user_resource_authorisations (user_id, resource_class, resource_id, effect, status)
    SELECT p_user_id, 'study', s, 'allow', 'active'
      FROM unnest(p_study_ids) AS s;
  END IF;
END $$;

-- Authorisation: server-only (service_role); admin-only is still enforced at the API layer
-- (requireUser) before any of these is called. SECURITY INVOKER means no privilege elevation.
REVOKE ALL ON FUNCTION public.record_organisation_name_change(uuid, text, text, text, text, text, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_organisation_name_change(uuid, text, text, text, text, text, date) TO service_role;
REVOKE ALL ON FUNCTION public.set_organisation_access_set(uuid, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_organisation_access_set(uuid, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.sync_selected_study_authorisations(uuid, uuid[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.sync_selected_study_authorisations(uuid, uuid[]) TO service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- PART 2 — CF-002: CONCURRENCY-CORRECT CONSISTENCY (NFR-004)
-- Move the two identified read-then-write (TOCTOU) invariants to authoritative DB enforcement
-- that stays correct under concurrent writers. These enforce EXISTING invariants — they add no
-- new domain rule; the application pre-checks remain only to produce friendly messages.
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- 2A — Office attachment exclusivity (FR-010): no two LIVE attachments of the same Office may
-- apply at the same represented-world point. Enforced as a partial GiST exclusion constraint on
-- the half-open applicability interval — correct under concurrent inserts/updates (the app-level
-- overlap pre-check could be raced). btree_gist provides the "office_id WITH =" operator class.
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_office_attachment_no_overlap') THEN
    ALTER TABLE public.organisation_office_attachments
      ADD CONSTRAINT org_office_attachment_no_overlap
      EXCLUDE USING gist (
        office_id WITH =,
        daterange(effective_from, effective_to, '[)') WITH &&
      ) WHERE (deleted_at IS NULL);
  END IF;
END $$;

-- 2B — Organisation Unit removal ↔ live-children invariant, enforced concurrency-safely from
-- BOTH sides so a soft-delete and a concurrent child insert/re-parent cannot write-skew into a
-- live unit under a removed parent. The two operations contend on the SAME parent row lock:
--   • soft-delete is an UPDATE of the parent row (takes FOR NO KEY UPDATE on it);
--   • a child insert/re-parent SELECTs the parent FOR NO KEY UPDATE before proceeding.
-- Whichever commits first, the other observes the committed state and is rejected. This is the
-- existing invariant ("a removed unit contains no live sub-units") — not a new rule.

-- Guard the DELETE side: block soft-deleting a unit that still has live children.
CREATE OR REPLACE FUNCTION public.org_unit_block_delete_with_children() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.organisation_units c
       WHERE c.parent_unit_id = NEW.id AND c.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'unit_has_live_children: cannot remove a unit that still contains sub-units'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Guard the PLACEMENT side: block placing a live unit under a removed parent, taking the parent
-- row lock so this serialises with a concurrent soft-delete of that parent. Fires only when the
-- parent link is set/changed (INSERT or UPDATE OF parent_unit_id), so ordinary edits (e.g.
-- rename) are unaffected and pre-existing rows are not retro-validated.
CREATE OR REPLACE FUNCTION public.org_unit_block_live_under_removed_parent() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_parent_deleted timestamptz;
BEGIN
  IF NEW.parent_unit_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
    SELECT deleted_at INTO v_parent_deleted
      FROM public.organisation_units
     WHERE id = NEW.parent_unit_id
     FOR NO KEY UPDATE;
    IF v_parent_deleted IS NOT NULL THEN
      RAISE EXCEPTION 'parent_unit_removed: cannot place a live unit under a removed parent'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_org_unit_block_delete_with_children ON public.organisation_units;
CREATE TRIGGER trg_org_unit_block_delete_with_children
  BEFORE UPDATE OF deleted_at ON public.organisation_units
  FOR EACH ROW EXECUTE FUNCTION public.org_unit_block_delete_with_children();

DROP TRIGGER IF EXISTS trg_org_unit_block_live_under_removed_parent ON public.organisation_units;
CREATE TRIGGER trg_org_unit_block_live_under_removed_parent
  BEFORE INSERT OR UPDATE OF parent_unit_id ON public.organisation_units
  FOR EACH ROW EXECUTE FUNCTION public.org_unit_block_live_under_removed_parent();

NOTIFY pgrst, 'reload schema';

-- ── Rollback ────────────────────────────────────────────────────────────────────
--   DROP TRIGGER IF EXISTS trg_org_unit_block_live_under_removed_parent ON public.organisation_units;
--   DROP TRIGGER IF EXISTS trg_org_unit_block_delete_with_children ON public.organisation_units;
--   DROP FUNCTION IF EXISTS public.org_unit_block_live_under_removed_parent();
--   DROP FUNCTION IF EXISTS public.org_unit_block_delete_with_children();
--   ALTER TABLE public.organisation_office_attachments DROP CONSTRAINT IF EXISTS org_office_attachment_no_overlap;
--   -- (btree_gist left installed; harmless. Drop with: DROP EXTENSION IF EXISTS btree_gist; only if unused.)
--   DROP FUNCTION IF EXISTS public.sync_selected_study_authorisations(uuid, uuid[]);
--   DROP FUNCTION IF EXISTS public.set_organisation_access_set(uuid, jsonb);
--   DROP FUNCTION IF EXISTS public.record_organisation_name_change(uuid, text, text, text, text, text, date);
--   (No table/column/data is created or modified by this migration; removal restores prior state.
--    Application code falls back to its own multi-statement paths only if reverted in lockstep.)
