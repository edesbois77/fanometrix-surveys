-- Migration 162 - ORG-004 BP-05 / IC-09: Authority material constraints + basis references (R07)
--
-- PHASE A - PROPOSED, NOT YET APPLIED. Awaiting migration control review.
--
-- Two structured child facts of an Organisational Authority (migration 161):
--
--   organisation_authority_constraints (FR-004/011/012) - each material threshold, jurisdiction,
--     condition or limit established as part of the Authority fact. FA-B deterministic
--     satisfaction interpretation is service-layer; this preserves each constraint as governed
--     structure (not free-text-as-canonical) so each is independently interpretable.
--
--   organisation_authority_bases (FR-015/016/017) - OPTIONAL references to already-established
--     independently governed bases. INTERNAL bases (R06 Office, R05 Relationship incl.
--     office-holding) are consumed BY REFERENCE with integrity (FK) and NOT recreated (FR-016).
--     EXTERNAL bases (Delegation/Agency/Appointment/Contract/statute/governing rule/other) are
--     REFERENCE-ONLY opaque strings (FR-017): R07 does not own or determine their semantics,
--     validity, lifecycle or legal effect (BE-02..05). A CHECK enforces the correct reference
--     shape per basis kind.
--
-- Additive, non-destructive, reversible, idempotent. No backfill.

-- -- Material constraints --------------------------------------------------------
CREATE TABLE IF NOT EXISTS organisation_authority_constraints (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_id    uuid        NOT NULL REFERENCES organisation_authorities (id) ON DELETE CASCADE,
  constraint_type text        NOT NULL CHECK (constraint_type IN ('threshold', 'jurisdiction', 'condition', 'limit')),
  descriptor      text        NOT NULL CHECK (length(btrim(descriptor)) > 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_authority_constraints_authority ON organisation_authority_constraints (authority_id);

-- -- Basis references (internal FK-checked; external reference-only) --------------
CREATE TABLE IF NOT EXISTS organisation_authority_bases (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_id         uuid        NOT NULL REFERENCES organisation_authorities (id) ON DELETE CASCADE,
  basis_kind           text        NOT NULL CHECK (basis_kind IN
                          ('office', 'relationship',
                           'delegation', 'agency', 'appointment', 'contract', 'statute', 'governing_rule', 'other')),
  -- Internal bases (consumed by reference, not recreated - FR-016):
  basis_office_id      uuid        REFERENCES organisation_offices (id),
  basis_relationship_id uuid       REFERENCES organisation_relationships (id),
  -- External bases (reference-only opaque; R07 does not own their semantics - FR-017):
  basis_external_ref   text,
  note                 text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  -- Exactly the reference appropriate to the kind is present.
  CONSTRAINT organisation_authority_bases_ref_shape CHECK (
    (basis_kind = 'office'
       AND basis_office_id IS NOT NULL AND basis_relationship_id IS NULL AND basis_external_ref IS NULL)
    OR (basis_kind = 'relationship'
       AND basis_relationship_id IS NOT NULL AND basis_office_id IS NULL AND basis_external_ref IS NULL)
    OR (basis_kind IN ('delegation', 'agency', 'appointment', 'contract', 'statute', 'governing_rule', 'other')
       AND basis_external_ref IS NOT NULL AND length(btrim(basis_external_ref)) > 0
       AND basis_office_id IS NULL AND basis_relationship_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_authority_bases_authority ON organisation_authority_bases (authority_id);

CREATE OR REPLACE FUNCTION public.set_authority_child_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$ BEGIN NEW.updated_at = pg_catalog.now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS authority_constraints_updated_at ON organisation_authority_constraints;
CREATE TRIGGER authority_constraints_updated_at BEFORE UPDATE ON organisation_authority_constraints
  FOR EACH ROW EXECUTE FUNCTION public.set_authority_child_updated_at();
DROP TRIGGER IF EXISTS authority_bases_updated_at ON organisation_authority_bases;
CREATE TRIGGER authority_bases_updated_at BEFORE UPDATE ON organisation_authority_bases
  FOR EACH ROW EXECUTE FUNCTION public.set_authority_child_updated_at();

ALTER TABLE organisation_authority_constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_authority_bases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authority_constraints_no_anon ON organisation_authority_constraints;
CREATE POLICY authority_constraints_no_anon ON organisation_authority_constraints FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS authority_bases_no_anon ON organisation_authority_bases;
CREATE POLICY authority_bases_no_anon ON organisation_authority_bases FOR ALL TO anon USING (false) WITH CHECK (false);

NOTIFY pgrst, 'reload schema';

-- -- Rollback --------------------------------------------------------------------
--   DROP FUNCTION IF EXISTS public.set_authority_child_updated_at() CASCADE;
--   DROP TABLE IF EXISTS organisation_authority_bases;
--   DROP TABLE IF EXISTS organisation_authority_constraints;
