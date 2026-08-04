-- Migration 157 - ORG-004 BP-03 Tier 2 fix: harden migration-155 trigger functions
-- against an empty/restricted search_path
--
-- PROPOSED, NOT YET APPLIED. Submitted for control review.
--
-- ROOT CAUSE
--   Migration 156's create_organisation_relationship() intentionally runs with
--   SET search_path = ''. Its SET CONSTRAINTS ALL IMMEDIATE forces the DEFERRED
--   participant-count constraint, which fires migration 155's trigger function
--   enforce_min_relationship_participants() WHILE the RPC's empty search_path is still
--   in effect. That 155 function had NO pinned search_path and referenced
--   organisation_relationships / organisation_relationship_participants UNQUALIFIED, so
--   under search_path='' the names did not resolve -> ERROR 42P01 (undefined_table).
--
-- FIX
--   CREATE OR REPLACE the migration-155 trigger functions with (a) fully schema-qualified
--   references to public objects and (b) a pinned SET search_path = '', so they resolve
--   correctly regardless of the caller's search_path. This is a Tier 2 implementation
--   correction: it changes NO table, column, constraint, trigger definition, index, seed,
--   permission or governed R03/R05 semantic - only the three function bodies. The >=2
--   participant constraint is preserved unchanged (still enforced by the same trigger,
--   now robust). Migration 156 is untouched (its SECURITY INVOKER / EXECUTE grants /
--   search_path='' are correct and remain).
--
-- FUNCTIONS CHANGED (all introduced by migration 155):
--   1. enforce_min_relationship_participants()  - the actual defect: unqualified table refs.
--   2. set_relationship_updated_at()            - hardened posture (was safe: only pg_catalog).
--   3. protect_system_relationship_type()       - hardened posture (was safe: no object refs).
--
-- Additive, idempotent (CREATE OR REPLACE), reversible. Safe to run more than once.

-- 1) The defective one - now schema-qualified + pinned search_path.
CREATE OR REPLACE FUNCTION public.enforce_min_relationship_participants()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE rel uuid; alive boolean; cnt int;
BEGIN
  IF TG_TABLE_NAME = 'organisation_relationships' THEN rel := COALESCE(NEW.id, OLD.id);
  ELSE rel := COALESCE(NEW.relationship_id, OLD.relationship_id); END IF;

  SELECT (deleted_at IS NULL) INTO alive FROM public.organisation_relationships WHERE id = rel;
  IF alive IS NULL OR alive = false THEN RETURN NULL; END IF;   -- gone or ceased-by-deletion: exempt

  SELECT count(*) INTO cnt FROM public.organisation_relationship_participants WHERE relationship_id = rel;
  IF cnt < 2 THEN
    RAISE EXCEPTION 'a canonical relationship must have at least two participants (relationship %, has %)', rel, cnt;
  END IF;
  RETURN NULL;
END;
$$;

-- 2) updated_at maintenance - pin search_path; qualify the built-in for good measure.
CREATE OR REPLACE FUNCTION public.set_relationship_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN NEW.updated_at = pg_catalog.now(); RETURN NEW; END;
$$;

-- 3) system-type deletion protection - pin search_path (no object references).
CREATE OR REPLACE FUNCTION public.protect_system_relationship_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.is_system THEN RAISE EXCEPTION 'cannot delete a system relationship type (%)', OLD.key; END IF;
  RETURN OLD;
END;
$$;

-- The existing triggers (migration 155) already point at these functions by name; replacing
-- the function bodies is sufficient - no trigger is dropped or recreated.

NOTIFY pgrst, 'reload schema';

-- -- Rollback / reversal ----------------------------------------------------------
-- Restores the exact migration-155 bodies (unqualified, no pinned search_path). NOTE: this
-- reintroduces the search_path defect and is provided only for completeness.
--
--   CREATE OR REPLACE FUNCTION public.enforce_min_relationship_participants()
--   RETURNS trigger AS $$
--   DECLARE rel uuid; alive boolean; cnt int;
--   BEGIN
--     IF TG_TABLE_NAME = 'organisation_relationships' THEN rel := COALESCE(NEW.id, OLD.id);
--     ELSE rel := COALESCE(NEW.relationship_id, OLD.relationship_id); END IF;
--     SELECT (deleted_at IS NULL) INTO alive FROM organisation_relationships WHERE id = rel;
--     IF alive IS NULL OR alive = false THEN RETURN NULL; END IF;
--     SELECT count(*) INTO cnt FROM organisation_relationship_participants WHERE relationship_id = rel;
--     IF cnt < 2 THEN
--       RAISE EXCEPTION 'a canonical relationship must have at least two participants (relationship %, has %)', rel, cnt;
--     END IF;
--     RETURN NULL;
--   END; $$ LANGUAGE plpgsql;
--
--   CREATE OR REPLACE FUNCTION public.set_relationship_updated_at()
--   RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
--
--   CREATE OR REPLACE FUNCTION public.protect_system_relationship_type()
--   RETURNS trigger AS $$
--   BEGIN
--     IF OLD.is_system THEN RAISE EXCEPTION 'cannot delete a system relationship type (%)', OLD.key; END IF;
--     RETURN OLD;
--   END; $$ LANGUAGE plpgsql;
