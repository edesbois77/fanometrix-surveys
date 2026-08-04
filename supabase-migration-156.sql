-- Migration 156 — ORG-004 BP-03 / IC-07 support: atomic relationship creation RPC
--
-- ⚠ PROPOSED, NOT YET APPLIED. Introduced during BP-03 Phase B and submitted for explicit
-- control review (it was not part of the Phase-A-approved 154–155 set).
--
-- WHAT THIS IS — solely an ATOMIC TRANSACTIONAL CREATION MECHANISM over the already-approved
-- model in migrations 154–155. It creates NO table, column, constraint, index, type, seed or
-- governed semantic. It introduces NO new domain concept. It only inserts into the existing
-- organisation_relationships / organisation_relationship_participants tables using the
-- existing constraints, inside one transaction.
--
-- WHY — migration 155 enforces the R05 FR-001/013 invariant "a relationship associates ≥2
-- participants" with a DEFERRABLE INITIALLY DEFERRED constraint that validates at transaction
-- commit. The application data layer reaches Postgres through PostgREST, where each insert is
-- its own autocommitted transaction, so a bare relationship insert would commit with zero
-- participants and fail the constraint. This function performs the relationship insert and all
-- participant inserts in ONE transaction, so the ≥2 invariant is preserved (not weakened) while
-- creation is possible from the service layer. All other operations (correct, cease, retire,
-- add/remove/edit participant) use direct table access and are unaffected.
--
-- Additive, reversible, idempotent (CREATE OR REPLACE). Safe to run more than once.

CREATE OR REPLACE FUNCTION public.create_organisation_relationship(
  p_type_id        uuid,
  p_descriptor     text,
  p_effective_from date,
  p_effective_to   date,
  p_participants   jsonb   -- [{ "subjectId": uuid, "subjectKind": text, "role": text|null }, ...]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER          -- runs with the CALLER's privileges; no privilege elevation
SET search_path = ''      -- pinned empty; every object below is schema-qualified (no search_path hijack)
AS $$
DECLARE
  rel uuid;
  p   jsonb;
BEGIN
  -- Relationship fact. type_id FK, applicability CHECK validate immediately here.
  INSERT INTO public.organisation_relationships (type_id, descriptor, effective_from, effective_to)
    VALUES (p_type_id, p_descriptor, p_effective_from, p_effective_to)
    RETURNING id INTO rel;

  -- Participants. The composite subject FK (subject exists in organisation_subjects), the
  -- subject_kind CHECK (organisation|organisation_unit — office excluded) and the unique
  -- participant constraint validate immediately on each insert here.
  FOR p IN SELECT jsonb_array_elements(COALESCE(p_participants, '[]'::jsonb)) LOOP
    INSERT INTO public.organisation_relationship_participants
      (relationship_id, subject_id, subject_kind, participant_role)
    VALUES (rel, (p->>'subjectId')::uuid, p->>'subjectKind', NULLIF(p->>'role', ''));
  END LOOP;

  -- Force the DEFERRED ≥2-participant constraint (migration 155) to validate NOW, before this
  -- function returns, rather than only at outer COMMIT. A violation raises here and, being
  -- unhandled, aborts the whole function's transaction → the relationship and every participant
  -- inserted above are rolled back atomically. No EXCEPTION handler is used, precisely so any
  -- failure propagates and rolls back the complete operation.
  SET CONSTRAINTS ALL IMMEDIATE;

  RETURN rel;
END;
$$;

-- Authorisation: callable only by the server (service_role). Removing the default PUBLIC
-- EXECUTE grant prevents anon/authenticated from invoking it via PostgREST RPC. Admin-only
-- authorisation is still enforced at the API layer (requireUser(req,["admin"])) before the
-- service ever calls this; RLS deny-anon on the two tables is a further backstop. SECURITY
-- INVOKER means even an unexpected caller gets no elevated privileges.
REVOKE ALL ON FUNCTION public.create_organisation_relationship(uuid, text, date, date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organisation_relationship(uuid, text, date, date, jsonb) TO service_role;

-- ── Rollback ────────────────────────────────────────────────────────────────────
--   DROP FUNCTION IF EXISTS public.create_organisation_relationship(uuid, text, date, date, jsonb);
--   (No table/column/constraint/seed is created by this migration, so removal restores the
--    exact 154–155 state.)
