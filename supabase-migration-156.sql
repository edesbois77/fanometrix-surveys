-- Migration 156 — ORG-004 BP-03 / IC-07 support: atomic relationship creation RPC
--
-- ⚠ PHASE A/B — PROPOSED, NOT YET APPLIED TO PRODUCTION. Added during Phase B and
-- flagged for control review (not silently applied).
--
-- WHY: migration 155 enforces the R05 FR-001/013 invariant "a relationship associates
-- ≥2 participants" with a DEFERRABLE INITIALLY DEFERRED constraint that validates at
-- transaction commit. The application data layer reaches Postgres through PostgREST,
-- where each insert is its own autocommitted transaction — so a bare relationship insert
-- would commit with zero participants and fail the constraint. This function creates a
-- relationship and its participants in ONE transaction, so the deferred constraint
-- validates once, with all rows present. It changes NO domain semantics and weakens NO
-- constraint — it is the transactional entry point that keeps the ≥2 rule DB-authoritative
-- while remaining usable from the service layer. All other operations (correct, cease,
-- add/remove/edit participant) work through direct table access and are unaffected.
--
-- Additive, reversible, idempotent (CREATE OR REPLACE). Safe to run more than once.

CREATE OR REPLACE FUNCTION create_organisation_relationship(
  p_type_id        uuid,
  p_descriptor     text,
  p_effective_from date,
  p_effective_to   date,
  p_participants   jsonb   -- [{ "subjectId": uuid, "subjectKind": text, "role": text|null }, ...]
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  rel uuid;
  p   jsonb;
BEGIN
  INSERT INTO organisation_relationships (type_id, descriptor, effective_from, effective_to)
    VALUES (p_type_id, p_descriptor, p_effective_from, p_effective_to)
    RETURNING id INTO rel;

  FOR p IN SELECT jsonb_array_elements(COALESCE(p_participants, '[]'::jsonb)) LOOP
    INSERT INTO organisation_relationship_participants (relationship_id, subject_id, subject_kind, participant_role)
      VALUES (
        rel,
        (p->>'subjectId')::uuid,
        p->>'subjectKind',
        NULLIF(p->>'role', '')
      );
  END LOOP;

  -- The deferred ≥2 constraint (migration 155) validates at commit of the calling
  -- transaction. Immediate constraints (composite subject FK, subject_kind CHECK,
  -- unique participant, applicability CHECK) validate inline above.
  RETURN rel;
END;
$$;

-- ── Rollback ────────────────────────────────────────────────────────────────────
--   DROP FUNCTION IF EXISTS create_organisation_relationship(uuid, text, date, date, jsonb);
