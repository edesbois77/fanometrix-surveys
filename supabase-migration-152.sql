-- Migration 152 — ORG-004 BP-02 / IC-04: Canonical Organisation Identifiers
--
-- ⚠ PHASE A — PROPOSED, NOT YET APPLIED TO PRODUCTION. Awaiting control review.
--
-- Canonical Identifier facts for eligible subjects (Organisation, Organisation
-- Unit), kept strictly separate from technical UUIDs, Names and Classifications.
--
-- ARCHITECTURAL DISTINCTIONS PRESERVED (R04 / BP-02 §9):
--   * organisations.id and organisation_subjects.subject_id are NOT canonical
--     Identifiers and are not represented here.
--   * A designation ('the code') is only meaningful within its identifying context.
--     Context is captured as ATTRIBUTES of the Identifier fact — scheme (required),
--     optional issuing authority and namespace — NOT as new first-class concepts.
--     No Scheme/Authority/Register/Registry/Namespace tables are introduced.
--   * No naive global uniqueness on the designation alone: the same code may exist
--     under different schemes/authorities. Only exact-duplicate facts for the same
--     subject+scheme+authority+designation are prevented.
--   * Effective Applicability (represented-world dates) is owned by the fact where
--     material; system time (created_at/updated_at) is kept separate.
--
-- Additive, non-destructive, reversible, idempotent. Safe to run more than once.

CREATE TABLE IF NOT EXISTS organisation_identifiers (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id     uuid        NOT NULL,
  subject_kind   text        NOT NULL CHECK (subject_kind IN ('organisation', 'organisation_unit')),
  -- Required identifying context: the scheme/namespace the designation belongs to
  -- (e.g. 'lei', 'companies_house', 'duns', 'vat_gb'). Without it a designation is
  -- not meaningful. Free text by design — schemes are not first-class in BP-02.
  scheme         text        NOT NULL CHECK (length(btrim(scheme)) > 0),
  -- The identifying value itself.
  designation    text        NOT NULL CHECK (length(btrim(designation)) > 0),
  -- Optional further context: the issuing authority and/or a finer namespace.
  authority      text,
  namespace      text,
  effective_from date,
  effective_to   date,
  created_at     timestamptz NOT NULL DEFAULT now(),   -- system time, NOT applicability
  updated_at     timestamptz NOT NULL DEFAULT now(),   -- system time, NOT applicability
  deleted_at     timestamptz,
  deleted_by     text,
  CONSTRAINT organisation_identifiers_effective_order
    CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
  CONSTRAINT organisation_identifiers_subject_fk
    FOREIGN KEY (subject_id, subject_kind) REFERENCES organisation_subjects (subject_id, subject_kind)
);

CREATE INDEX IF NOT EXISTS idx_organisation_identifiers_subject ON organisation_identifiers (subject_id);
-- Look up "who holds designation X in scheme Y" without asserting it is unique.
CREATE INDEX IF NOT EXISTS idx_organisation_identifiers_scheme_designation
  ON organisation_identifiers (scheme, designation);
-- Prevent only exact-duplicate identifier facts on the same subject (context-aware,
-- NOT global-designation uniqueness). COALESCE so NULL authority/namespace dedupe too.
CREATE UNIQUE INDEX IF NOT EXISTS uq_organisation_identifiers_fact
  ON organisation_identifiers
     (subject_id, scheme, designation, COALESCE(authority, ''), COALESCE(namespace, ''))
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION set_organisation_identifiers_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS organisation_identifiers_updated_at_trigger ON organisation_identifiers;
CREATE TRIGGER organisation_identifiers_updated_at_trigger
  BEFORE UPDATE ON organisation_identifiers
  FOR EACH ROW EXECUTE FUNCTION set_organisation_identifiers_updated_at();

ALTER TABLE organisation_identifiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organisation_identifiers_no_anon ON organisation_identifiers;
CREATE POLICY organisation_identifiers_no_anon ON organisation_identifiers
  FOR ALL TO anon USING (false) WITH CHECK (false);

NOTIFY pgrst, 'reload schema';

-- No backfill: existing production holds no canonical Identifier data (technical
-- UUIDs are explicitly NOT Identifiers), so there is nothing to seed.

-- ── Rollback ────────────────────────────────────────────────────────────────────
--   DROP FUNCTION IF EXISTS set_organisation_identifiers_updated_at();
--   DROP TABLE IF EXISTS organisation_identifiers;
