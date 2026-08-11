-- Migration 178 — ORG-007 CF-001 successor correction: search_path-safe canonical Name triggers
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- ⚠ HAND-APPLIED, per project practice. Additive, reversible, idempotent (CREATE OR REPLACE only).
-- Creates/alters NO table, column, constraint, index, trigger BINDING, seed or governed semantic.
-- It ONLY re-defines existing migration-151 trigger FUNCTIONS to be schema-qualification-safe.
--
-- ── WHY (production-verification finding against migration 177) ──────────────────────────────
-- The migration-177 RPC record_organisation_name_change is declared `SET search_path = ''` (the
-- recommended anti-search_path-hijack hardening; every object it names is schema-qualified). A
-- function's search_path setting remains in force for the NESTED trigger functions it invokes.
-- When the RPC writes public.organisation_names it fires the migration-151 AFTER trigger
-- sync_name_projection(), which was written WITHOUT its own search_path and with UNQUALIFIED
-- object references (organisation_names, organisations, organisation_units). Under the inherited
-- empty search_path those references cannot resolve, producing:
--     ERROR 42P01: relation "organisation_names" does not exist   (inside sync_name_projection)
-- during supabase-migration-177-verify.sql Part 1A.
--
-- ── WHAT THIS FIXES ──────────────────────────────────────────────────────────────────────────
-- REQUIRED (blocks the 177 RPCs): sync_name_projection() — the only migration-151 function that
--   is invoked by the 177 RPCs AND carries the unqualified-reference defect.
-- HARDENING (same defect class, NOT invoked by the 177 RPCs; their normal call paths run under
--   the session search_path so they are not currently broken): seed_primary_name_for_organisation,
--   seed_primary_name_for_unit, reroute_legacy_name_to_canonical, reroute_legacy_unit_name_to_canonical.
--   Corrected here in one controlled migration so a future search_path-pinned caller cannot
--   re-introduce the same failure. (set_organisation_names_updated_at / set_updated_at reference
--   only now() from pg_catalog — always resolvable — so they are already safe and unchanged.)
--
-- Each function is re-defined with IDENTICAL logic; the ONLY changes are `SET search_path = ''`
-- and fully schema-qualifying every table reference (public.*). SECURITY INVOKER is unchanged
-- (no privilege change). pg_catalog builtins (now, gen_random_uuid, pg_trigger_depth, btrim,
-- length, coalesce) resolve implicitly even under an empty search_path. Governed behaviour —
-- the one-way canonical→projection sync, birth-seed, and legacy-write reroute — is unchanged.

-- ── REQUIRED: one-way projection current primary canonical Name → legacy display column ──
CREATE OR REPLACE FUNCTION public.sync_name_projection()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE subj uuid; kind text; v text;
BEGIN
  subj := COALESCE(NEW.subject_id, OLD.subject_id);
  kind := COALESCE(NEW.subject_kind, OLD.subject_kind);
  SELECT value INTO v FROM public.organisation_names
    WHERE subject_id = subj AND is_primary AND deleted_at IS NULL
    LIMIT 1;
  IF v IS NULL THEN RETURN NULL; END IF;  -- no primary right now: leave last projection intact
  IF kind = 'organisation' THEN
    UPDATE public.organisations SET name = v WHERE id = subj AND name IS DISTINCT FROM v;
  ELSIF kind = 'organisation_unit' THEN
    UPDATE public.organisation_units SET name = v WHERE id = subj AND name IS DISTINCT FROM v;
  END IF;
  RETURN NULL;
END;
$$;

-- ── HARDENING (same defect class; not invoked by the 177 RPCs) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_primary_name_for_organisation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.organisation_names (subject_id, subject_kind, value, name_form, is_primary)
  SELECT NEW.id, 'organisation', NEW.name, 'display', true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.organisation_names WHERE subject_id = NEW.id AND is_primary AND deleted_at IS NULL);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_primary_name_for_unit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.organisation_names (subject_id, subject_kind, value, name_form, is_primary)
  SELECT NEW.id, 'organisation_unit', NEW.name, 'display', true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.organisation_names WHERE subject_id = NEW.id AND is_primary AND deleted_at IS NULL);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reroute_legacy_name_to_canonical()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;   -- nested (from projection) → ignore
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.organisation_names SET value = NEW.name
      WHERE subject_id = NEW.id AND is_primary AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reroute_legacy_unit_name_to_canonical()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.organisation_names SET value = NEW.name
      WHERE subject_id = NEW.id AND is_primary AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- ── Rollback ────────────────────────────────────────────────────────────────────
--   Re-applying migration 151 restores the prior (unqualified, no-search_path) definitions of
--   these five functions verbatim. Note: reverting 178 WITHOUT also reverting the migration-177
--   record_organisation_name_change RPC would re-introduce the 42P01 defect, so revert them in
--   lockstep (drop the RPC or remove its SET search_path) if ever rolling back.
--   (No table/column/data/trigger-binding is changed by this migration.)
