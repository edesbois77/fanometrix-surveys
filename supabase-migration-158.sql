-- Migration 158 - ORG-004 BP-04 / IC-08 (part): Organisational Office subject + structural attachment
--
-- ! PHASE A - PROPOSED, NOT YET APPLIED. Awaiting migration control review. This migration
-- covers ONLY the unambiguously governed, stable Organisational Office SUBJECT core
-- (R06 FR-001..015, FR-023). Office-HOLDING (FR-016..022, FR-024..030) is DEFERRED because
-- its holder participant (FR-018) references an actor governed by an EXTERNAL holder-subject
-- architecture that does not exist in Fanometrix and is out of BP-04's admitted scope
-- (see the Phase A report: external holder-subject dependency; universal Person model excluded
-- by the BP-04 brief -6). No office-holding relationship, no holder, no Authority is created here.
--
-- GOVERNED BASIS (verbatim R06 FRs):
--   FR-001 Office is an independently distinguishable subject, distinct from the Organisation,
--          any Organisation Unit, and any actor that holds it.
--   FR-002 Office is the subject of authorised facts (Names/Identifiers/Classifications). NOTE:
--          admitting 'organisational_office' to the BP-02 fact tables' subject_kind CHECKs is an
--          ADDITIVE relaxation of closed BP-02 objects and is DEFERRED pending control confirmation
--          (see Phase A report). A minimal office-owned `title` is provided here for display.
--   FR-003 Office persists through holder change / no holder (no lifecycle/status column).
--   FR-004/005/006 Office replacement is NOT determined by title/name/identifier/classification/
--          authority/org changes, unit relocation, or non-deterministic transformation (negative
--          boundaries; the office row is simply stable).
--   FR-007 Effective Applicability for Office existence where material.
--   FR-008 current/historical/future derived from applicability, not stored lifecycle states.
--   FR-009 SHALL NOT infer Authority from Office (Authority is BP-05; none created here).
--   FR-010 exactly one governing Organisation per applicable structural-attachment point.
--   FR-011 Office attached directly to its governing Organisation OR via ONE Unit of that Org.
--   FR-012 any Unit used as location must belong to the Office's governing Organisation.
--   FR-013 structural situation within a Unit is an OFFICE attachment fact; it must NOT create or
--          alter Organisation Unit constitutive containment (organisation_units is untouched).
--   FR-014 attachment may change between valid locations within the same governing Org without
--          replacing the Office (attachment is a separate temporal fact).
--   FR-015 Effective Applicability for structural attachment where material.
--
-- Additive, non-destructive, reversible, idempotent. No backfill (no legacy Office data).

-- -- Organisational Office (existence as a subject) ------------------------------
CREATE TABLE IF NOT EXISTS organisation_offices (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Office-owned display title. FR-002 canonical Office Names/Identifiers/Classifications are a
  -- DEFERRED additive relaxation of the BP-02 fact tables (see header/report); this is a minimal
  -- office-owned label, analogous to organisation_units.name.
  title          text        NOT NULL CHECK (length(btrim(title)) > 0),
  -- Constant technical discriminator carrying the subject kind into the composite FK (BP-01 pattern).
  subject_kind   text        NOT NULL DEFAULT 'organisational_office'
                   CHECK (subject_kind = 'organisational_office'),
  -- Office EXISTENCE applicability (FR-007), half-open [from, to). Distinct from attachment applicability.
  effective_from date,
  effective_to   date,
  created_at     timestamptz NOT NULL DEFAULT now(),   -- system time, NOT applicability
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,                          -- erroneous-entry removal, distinct from cessation
  deleted_by     text,
  CONSTRAINT organisation_offices_effective_order
    CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from)
);

CREATE OR REPLACE FUNCTION public.set_organisation_offices_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$ BEGIN NEW.updated_at = pg_catalog.now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS organisation_offices_updated_at_trigger ON organisation_offices;
CREATE TRIGGER organisation_offices_updated_at_trigger
  BEFORE UPDATE ON organisation_offices FOR EACH ROW EXECUTE FUNCTION public.set_organisation_offices_updated_at();

-- Register each Office as an 'organisational_office' subject (BP-01 reserved this kind). Mirrors
-- the organisations / organisation_units registration pattern; kind-checked composite FK.
CREATE OR REPLACE FUNCTION public.register_organisation_office_subject()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE existing_kind text;
BEGIN
  SELECT subject_kind INTO existing_kind FROM public.organisation_subjects WHERE subject_id = NEW.id;
  IF existing_kind IS NULL THEN
    INSERT INTO public.organisation_subjects (subject_id, subject_kind) VALUES (NEW.id, 'organisational_office');
  ELSIF existing_kind <> 'organisational_office' THEN
    RAISE EXCEPTION 'cannot create organisational office %: subject id already registered as kind %', NEW.id, existing_kind
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS organisation_offices_register_subject_trigger ON organisation_offices;
CREATE TRIGGER organisation_offices_register_subject_trigger
  BEFORE INSERT ON organisation_offices FOR EACH ROW EXECUTE FUNCTION public.register_organisation_office_subject();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organisation_offices_subject_fk') THEN
    ALTER TABLE organisation_offices
      ADD CONSTRAINT organisation_offices_subject_fk
      FOREIGN KEY (id, subject_kind) REFERENCES organisation_subjects (subject_id, subject_kind);
  END IF;
END $$;

-- -- Structural attachment (a separate, temporally-applicable Office fact) --------
-- FR-010/011/014/015: exactly one governing Organisation per applicable point; direct or via ONE
-- Unit of that Organisation; changeable over time; own applicability. It is an OFFICE attachment
-- fact (FR-013): it does NOT touch organisation_units constitutive containment.
CREATE TABLE IF NOT EXISTS organisation_office_attachments (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id               uuid        NOT NULL REFERENCES organisation_offices (id) ON DELETE CASCADE,
  -- Exactly one governing Organisation (FR-010).
  governing_organisation_id uuid      NOT NULL REFERENCES organisations (id),
  -- Optional Unit-mediated location (FR-011); NULL = attached directly to the governing Organisation.
  organisation_unit_id    uuid        REFERENCES organisation_units (id),
  effective_from          date,
  effective_to            date,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  deleted_at              timestamptz,
  deleted_by              text,
  CONSTRAINT organisation_office_attachments_effective_order
    CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from)
);
CREATE INDEX IF NOT EXISTS idx_office_attachments_office ON organisation_office_attachments (office_id);
CREATE INDEX IF NOT EXISTS idx_office_attachments_org    ON organisation_office_attachments (governing_organisation_id);

DROP TRIGGER IF EXISTS organisation_office_attachments_updated_at ON organisation_office_attachments;
CREATE TRIGGER organisation_office_attachments_updated_at
  BEFORE UPDATE ON organisation_office_attachments FOR EACH ROW EXECUTE FUNCTION public.set_organisation_offices_updated_at();

-- FR-012: any Unit used as the location must belong to the Office's governing Organisation.
CREATE OR REPLACE FUNCTION public.office_attachment_unit_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE unit_org uuid;
BEGIN
  IF NEW.organisation_unit_id IS NOT NULL THEN
    SELECT organisation_id INTO unit_org FROM public.organisation_units
      WHERE id = NEW.organisation_unit_id AND deleted_at IS NULL;
    IF unit_org IS NULL THEN
      RAISE EXCEPTION 'office attachment unit % does not exist or is deleted', NEW.organisation_unit_id;
    END IF;
    IF unit_org <> NEW.governing_organisation_id THEN
      RAISE EXCEPTION 'office attachment unit % does not belong to the governing organisation %', NEW.organisation_unit_id, NEW.governing_organisation_id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS organisation_office_attachments_unit_guard ON organisation_office_attachments;
CREATE TRIGGER organisation_office_attachments_unit_guard
  BEFORE INSERT OR UPDATE OF organisation_unit_id, governing_organisation_id ON organisation_office_attachments
  FOR EACH ROW EXECUTE FUNCTION public.office_attachment_unit_guard();

-- NOTE: FR-010's "exactly one governing Organisation at each applicable point" is a temporal
-- interpretation invariant across attachment rows; like BP-03 overlap semantics it is applied in
-- the service/interpretation layer (Phase B), not as a hard non-overlap DB constraint.

-- App-authorized only; RLS deny-anon (matches every Organisations table).
ALTER TABLE organisation_offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_office_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organisation_offices_no_anon ON organisation_offices;
CREATE POLICY organisation_offices_no_anon ON organisation_offices FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS organisation_office_attachments_no_anon ON organisation_office_attachments;
CREATE POLICY organisation_office_attachments_no_anon ON organisation_office_attachments FOR ALL TO anon USING (false) WITH CHECK (false);

NOTIFY pgrst, 'reload schema';

-- -- Rollback --------------------------------------------------------------------
--   DROP TABLE IF EXISTS organisation_office_attachments;
--   DROP TABLE IF EXISTS organisation_offices;   -- cascades its triggers/constraints
--   DROP FUNCTION IF EXISTS public.office_attachment_unit_guard();
--   DROP FUNCTION IF EXISTS public.register_organisation_office_subject();
--   DROP FUNCTION IF EXISTS public.set_organisation_offices_updated_at();
--   DELETE FROM organisation_subjects WHERE subject_kind = 'organisational_office';  -- only if offices were created
--   (organisations, organisation_units and all BP-01/02/03 objects are untouched.)
