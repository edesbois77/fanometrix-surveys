-- Migration 154 — ORG-004 BP-03 / IC-05: Organisational Identity (R03)
--
-- ⚠ PHASE A — PROPOSED, NOT YET APPLIED TO PRODUCTION. Awaiting migration control review.
--
-- A qualifying Organisational Identity is a distinct, recognised, durable identity
-- ASSOCIATED WITH an existing Organisation (R03 FR-001). It is deliberately NOT an
-- organisation_subjects subject (IC-01 is not broadened): an Identity is associated to
-- its Organisation by organisation_id, and does not determine Organisation subjecthood
-- or persistence (FR-002). Identities are OPTIONAL (0 per org, FR-003) and MULTIPLE
-- (many per org, FR-004), each durable and changing independently (FR-013).
--
-- SEMANTIC BOUNDARIES (enforced by keeping the table minimal + Identity-owned):
--   * Identity is independent of Name / Identifier / Classification (FR-010). `label`
--     is the Identity's OWN recognised descriptor (Identity-specific info, FR-008), not
--     an Organisation Name — organisation_names is untouched and unrelated.
--   * NOT a generic metadata container (FR-009): only Identity-owned descriptive fields.
--   * NO legal/constitutional identity, registration or personality (R03-BE-01).
--   * NO source-relative / Evidence / Provenance / Confidence / Acceptance (R03-BE-02).
--   * NO duplicate/merge/consolidation semantics (R03-BE-03) — multiple identities may
--     coexist and are never inferred to be duplicates.
--   * NO Organisation/Identity Status or lifecycle column (FR-020): current / historical
--     / future are DERIVED from Effective Applicability, never stored.
--   * NO uncertain/source-relative temporal fields (R03-BE-04) and no proposal/intention
--     field (R03-BE-05): a future-effective fact is expressed only by a real effective_from.
--
-- Effective Applicability (IC-06) reuses the governed half-open [from, to) convention
-- (from inclusive, to exclusive; to IS NULL = open; to > from; no zero-length), owned by
-- the Identity fact (FR-019..022). System time (created_at/updated_at) is kept separate.
--
-- Additive, non-destructive, reversible, idempotent. No backfill (no legacy Identity data
-- exists). Safe to run more than once.

CREATE TABLE IF NOT EXISTS organisation_identities (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Association to the existing Organisation. Not subjecthood; does not determine
  -- Organisation persistence (FR-002). Many identities may share one organisation_id (FR-004).
  organisation_id uuid        NOT NULL REFERENCES organisations (id),
  -- The Identity's own recognised descriptor (Identity-owned info, FR-008). NOT a Name.
  label           text        NOT NULL CHECK (length(btrim(label)) > 0),
  -- Optional further Identity-owned descriptive information (FR-008). Not a metadata bag.
  descriptor      text,
  -- Fact-owned Effective Applicability (half-open), where materially required (FR-019).
  effective_from  date,
  effective_to    date,
  created_at      timestamptz NOT NULL DEFAULT now(),   -- system time, NOT applicability
  updated_at      timestamptz NOT NULL DEFAULT now(),   -- system time, NOT applicability
  deleted_at      timestamptz,                          -- erroneous-entry removal, distinct from cessation
  deleted_by      text,
  CONSTRAINT organisation_identities_effective_order
    CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from)
);

CREATE INDEX IF NOT EXISTS idx_organisation_identities_org ON organisation_identities (organisation_id);

CREATE OR REPLACE FUNCTION set_organisation_identities_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS organisation_identities_updated_at_trigger ON organisation_identities;
CREATE TRIGGER organisation_identities_updated_at_trigger
  BEFORE UPDATE ON organisation_identities
  FOR EACH ROW EXECUTE FUNCTION set_organisation_identities_updated_at();

ALTER TABLE organisation_identities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organisation_identities_no_anon ON organisation_identities;
CREATE POLICY organisation_identities_no_anon ON organisation_identities
  FOR ALL TO anon USING (false) WITH CHECK (false);

NOTIFY pgrst, 'reload schema';

-- ── Rollback ────────────────────────────────────────────────────────────────────
--   DROP FUNCTION IF EXISTS set_organisation_identities_updated_at();
--   DROP TABLE IF EXISTS organisation_identities;
--   (organisations and all BP-01/BP-02 objects are untouched.)
