-- Migration 161 - ORG-004 BP-05 / IC-09: Organisational Authority fact (R07)
--
-- PHASE A - PROPOSED, NOT YET APPLIED. Awaiting migration control review.
--
-- Organisational Authority is a NON-FIRST-CLASS canonical fact/responsibility (AMEND-03 s2;
-- R07 s2.1; FR-006): the represented-world fact that an eligible actor (holder) is empowered
-- to act for an Organisation (principal) within a scope, subject to material constraints,
-- according to the Authority fact's OWN Effective Applicability, optionally referencing
-- established bases. It is deliberately NOT a first-class subject: NOT registered in
-- organisation_subjects; NO autonomous Authority identity, lifecycle, Name, Classification or
-- Relationships (FR-006).
--
-- HOLDER ELIGIBILITY IS AN EXTERNALLY GOVERNED, PRESERVED DEPENDENCY (control determination
-- J-1; R07 FR-002; AMEND-03 s11; R07-BE-01). R07 must NOT determine holder eligibility, and
-- existing IC-01 subjecthood/referenceability is NOT evidence of eligibility. Therefore NO
-- holder subject kind is eligible by default. Which kinds are eligible is data-governed by
-- authority_eligible_holder_kinds (SEEDED EMPTY). A BEFORE INSERT/UPDATE guard rejects any
-- Authority whose holder_subject_kind is not admitted there - so actual Authority INSTANCES are
-- UNAVAILABLE until an eligible holder kind is admitted under an architecture that establishes
-- that holder's eligibility (exactly as BP-04 preserved the office-holding holder). No Person/
-- Actor/universal-holder architecture is introduced, and no organisation/organisation_unit/
-- organisational_office is deemed eligible merely because it exists. The mechanism is additively
-- evolvable: admitting an eligible holder kind (and its reference integrity) later requires no
-- redesign of Organisational Authority.
--
-- PRINCIPAL (FR-003): the Organisation (mandatory). A Unit may provide structural context
-- (optional) but never substitutes for the principal; a guard requires any context Unit to
-- belong to the principal Organisation (control J-2 approved).
--
-- SCOPE (FR-004/009-013): the established class of action/matter/domain. Deterministic in/out
-- interpretation (FA-B) is service-layer and authors NO universal scope ontology.
--
-- APPLICABILITY (FR-018-024): Authority owns its OWN half-open Effective Applicability; never
-- inherited. current/historical/future are DERIVED, never stored. Represented-world time is
-- distinct from system time (FR-021).
--
-- SEPARATION (AMEND-03 s10; brief s5): a real-world Authority fact grants ZERO Fanometrix
-- platform permissions; app-authorised only (RLS deny-anon); no auth path references it. No
-- Delegation/Agency/Appointment/Contract/statute semantics, no Evidence/Provenance/Confidence/
-- Acceptance, no uncertain/proposed temporal (BE-02..06).
--
-- Additive, non-destructive, reversible, idempotent. No backfill; the holder-kind registry is
-- seeded EMPTY (no eligible holder kinds).

-- -- Externally-governed eligible holder-kind registry (SEEDED EMPTY) -------------
-- The extension point: a holder subject kind becomes eligible only by being admitted here,
-- under an architecture that establishes that holder's eligibility. It is intentionally empty.
CREATE TABLE IF NOT EXISTS authority_eligible_holder_kinds (
  kind        text        PRIMARY KEY,
  admitted_at timestamptz NOT NULL DEFAULT now(),
  note        text
);
ALTER TABLE authority_eligible_holder_kinds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authority_eligible_holder_kinds_no_anon ON authority_eligible_holder_kinds;
CREATE POLICY authority_eligible_holder_kinds_no_anon ON authority_eligible_holder_kinds FOR ALL TO anon USING (false) WITH CHECK (false);

-- -- The Authority fact ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS organisation_authorities (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Holder reference (actor id + kind). NO hard CHECK/FK to a subject architecture here: the
  -- eligible holder architecture is an unresolved external dependency, so holder integrity is
  -- admitted per-kind when that kind is admitted. Until then, the eligibility guard blocks all
  -- inserts, so no unverified holder can exist.
  holder_subject_id    uuid        NOT NULL,
  holder_subject_kind  text        NOT NULL,
  -- Principal Organisation (mandatory) + optional Unit structural context.
  organisation_id      uuid        NOT NULL REFERENCES organisations (id),
  organisation_unit_id uuid        REFERENCES organisation_units (id),
  scope                text        NOT NULL CHECK (length(btrim(scope)) > 0),
  effective_from       date,
  effective_to         date,
  created_at           timestamptz NOT NULL DEFAULT now(),   -- system time, NOT applicability (FR-021)
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz,
  deleted_by           text,
  CONSTRAINT organisation_authorities_effective_order
    CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from)
);
CREATE INDEX IF NOT EXISTS idx_organisation_authorities_holder ON organisation_authorities (holder_subject_id);
CREATE INDEX IF NOT EXISTS idx_organisation_authorities_org    ON organisation_authorities (organisation_id);

CREATE OR REPLACE FUNCTION public.set_organisation_authorities_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$ BEGIN NEW.updated_at = pg_catalog.now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS organisation_authorities_updated_at_trigger ON organisation_authorities;
CREATE TRIGGER organisation_authorities_updated_at_trigger
  BEFORE UPDATE ON organisation_authorities FOR EACH ROW EXECUTE FUNCTION public.set_organisation_authorities_updated_at();

-- Holder eligibility guard (preserved dependency): reject any Authority whose holder_subject_kind
-- is not admitted in authority_eligible_holder_kinds. With that registry empty, ALL Authority
-- instances are rejected until an eligible holder kind is admitted.
CREATE OR REPLACE FUNCTION public.enforce_authority_holder_eligibility()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.authority_eligible_holder_kinds k WHERE k.kind = NEW.holder_subject_kind) THEN
    RAISE EXCEPTION 'organisational authority instances are unavailable: holder subject kind % is not an admitted eligible holder (holder eligibility is an externally governed dependency - R07 FR-002 / BE-01)', NEW.holder_subject_kind
      USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS organisation_authorities_holder_eligibility ON organisation_authorities;
CREATE TRIGGER organisation_authorities_holder_eligibility
  BEFORE INSERT OR UPDATE OF holder_subject_kind ON organisation_authorities
  FOR EACH ROW EXECUTE FUNCTION public.enforce_authority_holder_eligibility();

-- FR-003 / control J-2: a Unit provided as structural context must belong to the principal.
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
--   DROP FUNCTION IF EXISTS public.enforce_authority_holder_eligibility() CASCADE;
--   DROP FUNCTION IF EXISTS public.organisation_authority_unit_guard() CASCADE;
--   DROP FUNCTION IF EXISTS public.set_organisation_authorities_updated_at() CASCADE;
--   DROP TABLE IF EXISTS organisation_authorities;
--   DROP TABLE IF EXISTS authority_eligible_holder_kinds;
--   (Authority is not a subject, so organisation_subjects is untouched. All BP-01..BP-04
--    objects are untouched.)
