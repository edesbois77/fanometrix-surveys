-- Migration 161 - ORG-004 BP-05 / IC-09: Organisational Authority fact (R07)
--
-- PHASE A - PROPOSED, NOT YET APPLIED. Awaiting migration control review.
--
-- Organisational Authority is a NON-FIRST-CLASS canonical fact/responsibility (AMEND-03 -2;
-- R07 -2.1; FR-006): the represented-world fact that an eligible actor (holder) is empowered
-- to act for an Organisation (principal) within a scope, subject to material constraints,
-- according to the Authority fact's OWN Effective Applicability, optionally referencing
-- established bases. It is deliberately NOT a first-class subject: it is NOT registered in
-- organisation_subjects and has NO autonomous Authority identity, lifecycle, Name,
-- Classification or Relationships (FR-006).
--
-- HOLDER (FR-001/002; AMEND-03 --3,11; BE-01): referenced by an already-established eligible
-- actor governed by that actor's architecture. R07 does NOT determine eligibility and does NOT
-- own a Person/Actor architecture. The IC-01 organisational subjects (organisation,
-- organisation_unit, organisational_office) are already-established referenceable actors and are
-- admitted as holders now. Externally-governed actors (Person, etc.) are the PRESERVED holder
-- dependency - not admissible until that architecture exists (the holder CHECK excludes them;
-- relaxed additively later, exactly as BP-04 preserved the office-holding holder). See Phase A
-- report Tier-2 decision + preserved dependency.
--
-- PRINCIPAL (FR-003): the Organisation for which authority is exercised (mandatory).
-- Organisation Unit may provide structural context (optional) but never substitutes for the
-- principal; a guard requires any context Unit to belong to the principal Organisation.
--
-- SCOPE (FR-004/009-013): the established class of action/matter/domain. Persisted as the
-- established scope; deterministic in/out-of-scope interpretation (FA-B) is service-layer and
-- authors NO universal scope ontology/taxonomy. Material constraints and optional basis
-- references are separate structured facts (migration 162).
--
-- APPLICABILITY (FR-018-024): Authority owns its OWN half-open Effective Applicability; never
-- inherited from holder/principal/Unit/Office/Relationship/basis. current/historical/future are
-- DERIVED, never stored (FR-020). Represented-world time is distinct from system time (FR-021).
--
-- SEPARATION (AMEND-03 -10; brief -5): a real-world Authority fact grants ZERO Fanometrix
-- platform permissions; this table is app-authorised only (RLS deny-anon) and no auth path
-- references it. No Delegation/Agency/Appointment/Contract/statute semantics, no Evidence/
-- Provenance/Confidence/Acceptance, no uncertain/proposed temporal (BE-02..06) are implemented.
--
-- Additive, non-destructive, reversible, idempotent. No backfill.

CREATE TABLE IF NOT EXISTS organisation_authorities (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Holder: an already-established eligible actor (IC-01 subject kinds admitted now).
  holder_subject_id    uuid        NOT NULL,
  holder_subject_kind  text        NOT NULL CHECK (holder_subject_kind IN ('organisation', 'organisation_unit', 'organisational_office')),
  -- Principal Organisation (mandatory) + optional Unit structural context.
  organisation_id      uuid        NOT NULL REFERENCES organisations (id),
  organisation_unit_id uuid        REFERENCES organisation_units (id),
  -- Established scope (class of action/matter/domain). Not a universal ontology.
  scope                text        NOT NULL CHECK (length(btrim(scope)) > 0),
  -- Authority-owned Effective Applicability (half-open), represented-world time.
  effective_from       date,
  effective_to         date,
  created_at           timestamptz NOT NULL DEFAULT now(),   -- system time, NOT applicability (FR-021)
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz,                          -- erroneous-entry removal, distinct from cessation
  deleted_by           text,
  CONSTRAINT organisation_authorities_effective_order
    CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from),
  -- Holder must be an already-established subject of the admitted kind (kind-checked composite FK).
  CONSTRAINT organisation_authorities_holder_fk
    FOREIGN KEY (holder_subject_id, holder_subject_kind) REFERENCES organisation_subjects (subject_id, subject_kind)
);
CREATE INDEX IF NOT EXISTS idx_organisation_authorities_holder ON organisation_authorities (holder_subject_id);
CREATE INDEX IF NOT EXISTS idx_organisation_authorities_org    ON organisation_authorities (organisation_id);

CREATE OR REPLACE FUNCTION public.set_organisation_authorities_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$ BEGIN NEW.updated_at = pg_catalog.now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS organisation_authorities_updated_at_trigger ON organisation_authorities;
CREATE TRIGGER organisation_authorities_updated_at_trigger
  BEFORE UPDATE ON organisation_authorities FOR EACH ROW EXECUTE FUNCTION public.set_organisation_authorities_updated_at();

-- FR-003: a Unit provided as structural context must belong to the principal Organisation.
CREATE OR REPLACE FUNCTION public.organisation_authority_unit_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE unit_org uuid;
BEGIN
  IF NEW.organisation_unit_id IS NOT NULL THEN
    SELECT organisation_id INTO unit_org FROM public.organisation_units
      WHERE id = NEW.organisation_unit_id AND deleted_at IS NULL;
    IF unit_org IS NULL THEN
      RAISE EXCEPTION 'authority context unit % does not exist or is deleted', NEW.organisation_unit_id;
    END IF;
    IF unit_org <> NEW.organisation_id THEN
      RAISE EXCEPTION 'authority context unit % does not belong to the principal organisation %', NEW.organisation_unit_id, NEW.organisation_id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS organisation_authorities_unit_guard ON organisation_authorities;
CREATE TRIGGER organisation_authorities_unit_guard
  BEFORE INSERT OR UPDATE OF organisation_unit_id, organisation_id ON organisation_authorities
  FOR EACH ROW EXECUTE FUNCTION public.organisation_authority_unit_guard();

ALTER TABLE organisation_authorities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organisation_authorities_no_anon ON organisation_authorities;
CREATE POLICY organisation_authorities_no_anon ON organisation_authorities
  FOR ALL TO anon USING (false) WITH CHECK (false);

NOTIFY pgrst, 'reload schema';

-- -- Rollback --------------------------------------------------------------------
--   DROP FUNCTION IF EXISTS public.organisation_authority_unit_guard() CASCADE;
--   DROP FUNCTION IF EXISTS public.set_organisation_authorities_updated_at() CASCADE;
--   DROP TABLE IF EXISTS organisation_authorities;
--   (Authority is not a subject, so organisation_subjects is untouched. All BP-01..BP-04
--    objects are untouched.)
