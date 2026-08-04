-- Migration 155 — ORG-004 BP-03 / IC-07: Relationship Substrate (R05)
--
-- ⚠ PHASE A — PROPOSED, NOT YET APPLIED TO PRODUCTION. Awaiting migration control review.
--
-- A canonical Relationship is a distinct domain fact representing a domain-significant
-- association among ≥2 already-existing eligible subjects, separate from the subjects
-- themselves (R05 FR-001/002/003). Three tables:
--   relationship_types                     — the intrinsic relational MEANING (FR-002/016);
--                                            a relationship must reference a defined type,
--                                            so arbitrary/unspecified links are impossible.
--   organisation_relationships             — the relationship fact + its Effective Applicability.
--   organisation_relationship_participants — participants by REFERENCE to IC-01 subjects,
--                                            with capacity/role and directionality (FR-008/012/013).
--
-- MEMBERSHIP (FR-018) and PREDECESSOR/SUCCESSOR LINEAGE (FR-029..031) are represented as
-- relationship TYPES on this one substrate — not as independent subjects/lifecycles. The
-- two are seeded as protected system types because the FRs mandate the capability; further
-- types are added by row configuration (no migration), analogous to classification schemes.
--
-- BOUNDARIES (governed):
--   * Participants reference organisation_subjects (IC-01) — Organisation and Organisation
--     Unit only in BP-03 (CHECK). Office is BP-04: the composite FK already targets the
--     registry, so BP-04 admits office participation by RELAXING this CHECK — additive, no
--     reshape (FR-011). No office is created or referenceable now (no office subjects exist).
--   * Constitutive Unit containment stays R02-owned and is NOT a Relationship (FR-010): a Unit
--     participates only in associations distinct from its organisation_id/parent_unit_id structure.
--   * A Relationship NEVER grants/propagates/revokes Fanometrix platform access (FR-012; §Platform
--     Authorisation boundary). participant_role is a canonical capacity, NOT Authority, Platform
--     Authorisation, legal standing, eligibility, qualification, approval or admission (FR-012/015).
--   * NO Relationship Status / History / lifecycle (FR-007/024): current/historical/future are
--     DERIVED from Effective Applicability. NO Evidence/Provenance/Confidence/Acceptance/competing
--     positions (R05-BE-01). NO uncertain/source-relative temporal (R05-BE-02). NO proposal/intention
--     (R05-BE-03). NO Agency legal/commercial semantics (R05-BE-04). NO eligibility/accreditation/
--     admission (R05-BE-05). NO Office/office-holding (R06/BP-04). NO Authority (R07/BP-05).
--
-- Effective Applicability (IC-06) reuses the half-open [from, to) convention, owned by the
-- Relationship fact (FR-007/022/023), distinct from system/record time (FR-027).
--
-- Additive, non-destructive, reversible, idempotent. No backfill of relationships/participants
-- (no legacy data). Safe to run more than once.

-- ── Relationship types: the intrinsic relational meaning ────────────────────────
CREATE TABLE IF NOT EXISTS relationship_types (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key            text        NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9_]+$'),
  label          text        NOT NULL,
  description    text,
  -- Whether the meaning is 'directed' (participants take distinct roles/capacities, e.g.
  -- member→body, predecessor→successor) or 'symmetric' (participants interchangeable) — FR-013.
  directionality text        NOT NULL DEFAULT 'directed' CHECK (directionality IN ('directed', 'symmetric')),
  is_system      boolean     NOT NULL DEFAULT false,   -- protected from deletion
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ── The Relationship fact ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organisation_relationships (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id        uuid        NOT NULL REFERENCES relationship_types (id),
  -- Optional human-readable descriptor. Per FR-019 a label/description does NOT create or
  -- alter canonical meaning — the meaning is the type. Non-canonical convenience only.
  descriptor     text,
  effective_from date,
  effective_to   date,
  created_at     timestamptz NOT NULL DEFAULT now(),   -- system time, NOT applicability (FR-027)
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  deleted_by     text,
  CONSTRAINT organisation_relationships_effective_order
    CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from)
);
CREATE INDEX IF NOT EXISTS idx_organisation_relationships_type ON organisation_relationships (type_id);

-- ── Participants (by reference to IC-01 subjects) ───────────────────────────────
CREATE TABLE IF NOT EXISTS organisation_relationship_participants (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id uuid        NOT NULL REFERENCES organisation_relationships (id) ON DELETE CASCADE,
  subject_id      uuid        NOT NULL,
  -- BP-03 eligible participants only. 'organisational_office' is intentionally excluded
  -- (Office is BP-04, which relaxes this CHECK additively). The composite FK below also
  -- guarantees the subject actually exists in the registry (no phantom participants).
  subject_kind    text        NOT NULL CHECK (subject_kind IN ('organisation', 'organisation_unit')),
  -- The capacity/role in which the participant takes part (FR-012). Carries directionality
  -- for directed types (e.g. 'member'/'body', 'predecessor'/'successor') — FR-013/030.
  -- NOT Authority, Platform Authorisation, legal standing, eligibility or admission.
  participant_role text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organisation_relationship_participants_subject_fk
    FOREIGN KEY (subject_id, subject_kind) REFERENCES organisation_subjects (subject_id, subject_kind),
  -- No exact-duplicate participant (same subject in the same role) within one relationship.
  CONSTRAINT organisation_relationship_participants_unique
    UNIQUE (relationship_id, subject_id, subject_kind, participant_role)
);
CREATE INDEX IF NOT EXISTS idx_relationship_participants_rel     ON organisation_relationship_participants (relationship_id);
CREATE INDEX IF NOT EXISTS idx_relationship_participants_subject ON organisation_relationship_participants (subject_id);

-- ── updated_at maintenance ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_relationship_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS relationship_types_updated_at ON relationship_types;
CREATE TRIGGER relationship_types_updated_at BEFORE UPDATE ON relationship_types
  FOR EACH ROW EXECUTE FUNCTION set_relationship_updated_at();
DROP TRIGGER IF EXISTS organisation_relationships_updated_at ON organisation_relationships;
CREATE TRIGGER organisation_relationships_updated_at BEFORE UPDATE ON organisation_relationships
  FOR EACH ROW EXECUTE FUNCTION set_relationship_updated_at();
DROP TRIGGER IF EXISTS relationship_participants_updated_at ON organisation_relationship_participants;
CREATE TRIGGER relationship_participants_updated_at BEFORE UPDATE ON organisation_relationship_participants
  FOR EACH ROW EXECUTE FUNCTION set_relationship_updated_at();

-- ── Domain integrity: a relationship associates AT LEAST TWO participants (FR-001/013) ──
-- Deferred so a relationship and its participants can be created in one transaction; checked
-- at commit (or SET CONSTRAINTS ALL IMMEDIATE). A soft-deleted/absent relationship is exempt.
CREATE OR REPLACE FUNCTION enforce_min_relationship_participants()
RETURNS trigger AS $$
DECLARE rel uuid; alive boolean; cnt int;
BEGIN
  IF TG_TABLE_NAME = 'organisation_relationships' THEN rel := COALESCE(NEW.id, OLD.id);
  ELSE rel := COALESCE(NEW.relationship_id, OLD.relationship_id); END IF;

  SELECT (deleted_at IS NULL) INTO alive FROM organisation_relationships WHERE id = rel;
  IF alive IS NULL OR alive = false THEN RETURN NULL; END IF;   -- gone or ceased-by-deletion: exempt

  SELECT count(*) INTO cnt FROM organisation_relationship_participants WHERE relationship_id = rel;
  IF cnt < 2 THEN
    RAISE EXCEPTION 'a canonical relationship must have at least two participants (relationship %, has %)', rel, cnt;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS organisation_relationships_min_participants ON organisation_relationships;
CREATE CONSTRAINT TRIGGER organisation_relationships_min_participants
  AFTER INSERT ON organisation_relationships
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_min_relationship_participants();
DROP TRIGGER IF EXISTS relationship_participants_min ON organisation_relationship_participants;
CREATE CONSTRAINT TRIGGER relationship_participants_min
  AFTER INSERT OR UPDATE OR DELETE ON organisation_relationship_participants
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_min_relationship_participants();

-- ── Protect system relationship types from deletion (governance) ────────────────
CREATE OR REPLACE FUNCTION protect_system_relationship_type()
RETURNS trigger AS $$
BEGIN
  IF OLD.is_system THEN RAISE EXCEPTION 'cannot delete a system relationship type (%)', OLD.key; END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS relationship_types_protect ON relationship_types;
CREATE TRIGGER relationship_types_protect BEFORE DELETE ON relationship_types
  FOR EACH ROW EXECUTE FUNCTION protect_system_relationship_type();

-- ── Seed FR-mandated system types (member relation FR-018; lineage FR-029..031) ─
INSERT INTO relationship_types (key, label, description, directionality, is_system) VALUES
  ('membership', 'Membership',
   'A recognised member relation: one subject is a member of another (roles: member, body). Represented as a Relationship (FR-018).',
   'directed', true),
  ('lineage_predecessor_successor', 'Predecessor / Successor (lineage)',
   'A domain-significant lineage association between independently established distinct subjects (roles: predecessor, successor). FR-029..031.',
   'directed', true)
ON CONFLICT (key) DO NOTHING;

-- ── RLS: app-authorized, service-role only (no anon) ────────────────────────────
ALTER TABLE relationship_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_relationship_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS relationship_types_no_anon ON relationship_types;
CREATE POLICY relationship_types_no_anon ON relationship_types FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS organisation_relationships_no_anon ON organisation_relationships;
CREATE POLICY organisation_relationships_no_anon ON organisation_relationships FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS relationship_participants_no_anon ON organisation_relationship_participants;
CREATE POLICY relationship_participants_no_anon ON organisation_relationship_participants FOR ALL TO anon USING (false) WITH CHECK (false);

NOTIFY pgrst, 'reload schema';

-- ── Rollback ────────────────────────────────────────────────────────────────────
--   DROP FUNCTION IF EXISTS enforce_min_relationship_participants() CASCADE;
--   DROP FUNCTION IF EXISTS protect_system_relationship_type() CASCADE;
--   DROP FUNCTION IF EXISTS set_relationship_updated_at() CASCADE;
--   DROP TABLE IF EXISTS organisation_relationship_participants;
--   DROP TABLE IF EXISTS organisation_relationships;
--   DROP TABLE IF EXISTS relationship_types;
--   (organisation_subjects and all BP-01/BP-02 objects are untouched.)
