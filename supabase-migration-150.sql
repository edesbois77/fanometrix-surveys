-- Migration 150 — ORG-004 BP-02 / IC-03: Organisation Units (Organisational Structure)
--
-- ⚠ PHASE A — PROPOSED, NOT YET APPLIED TO PRODUCTION. Awaiting control review.
--
-- Introduces Organisation Unit as a first-class organisational subject that
-- exists within an Organisation and may be nested beneath another Unit. Units
-- participate in the BP-01 technical subject registry as 'organisation_unit' and
-- may later carry Names/Identifiers/Classifications (added in 151-153).
--
-- SCOPE GUARDS (governed):
--   * Constitutive containment is intrinsic to the Unit (organisation_id +
--     parent_unit_id columns) — it is NOT a generic Relationship (that is BP-03).
--   * No universal Effective Temporality on Unit existence or containment (R02):
--     there are NO valid_from/valid_to existence-history columns. created_at /
--     updated_at are system time only, not represented-world applicability.
--   * No invented Unit Status/lifecycle. Deletion uses the existing Fanometrix
--     soft-delete convention (deleted_at / deleted_by), same as organisations.
--   * No Organisational Office is created or implied.
--
-- Additive, non-destructive, reversible. Safe to run more than once.

CREATE TABLE IF NOT EXISTS organisation_units (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Constitutive containment: the Organisation this Unit exists within. Intrinsic,
  -- not a Relationship fact. Immutable in practice (no cross-org transfer semantics
  -- are defined — see the guard trigger and the BP-02 brief §7 stop condition).
  organisation_id uuid        NOT NULL REFERENCES organisations (id),
  -- Optional constitutive nesting beneath another Unit in the SAME organisation.
  -- NULL => root Unit directly within the organisation. organisation_id itself is
  -- immutable after creation (enforced by the guard trigger) — BP-02 does not define
  -- cross-Organisation Unit movement/persistence (ORG-003 did not authorise it).
  parent_unit_id  uuid        REFERENCES organisation_units (id),
  -- Display/compatibility projection of the Unit's current primary canonical Name
  -- (canonical Name facts arrive in migration 151, which also seeds this). Kept
  -- non-null so admin/list surfaces always have a label, mirroring organisations.name.
  name            text        NOT NULL,
  -- Constant technical discriminator carrying the subject kind into the composite
  -- FK below (same pattern as organisations.subject_kind from BP-01).
  subject_kind    text        NOT NULL DEFAULT 'organisation_unit'
                    CHECK (subject_kind = 'organisation_unit'),
  created_at      timestamptz NOT NULL DEFAULT now(),   -- system time, NOT applicability
  updated_at      timestamptz NOT NULL DEFAULT now(),   -- system time, NOT applicability
  deleted_at      timestamptz,
  deleted_by      text,
  CONSTRAINT organisation_units_no_self_parent CHECK (parent_unit_id IS NULL OR parent_unit_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_organisation_units_org    ON organisation_units (organisation_id);
CREATE INDEX IF NOT EXISTS idx_organisation_units_parent ON organisation_units (parent_unit_id);
CREATE INDEX IF NOT EXISTS idx_organisation_units_deleted ON organisation_units (deleted_at);

-- updated_at maintenance (reuses the platform pattern).
CREATE OR REPLACE FUNCTION set_organisation_units_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS organisation_units_updated_at_trigger ON organisation_units;
CREATE TRIGGER organisation_units_updated_at_trigger
  BEFORE UPDATE ON organisation_units
  FOR EACH ROW EXECUTE FUNCTION set_organisation_units_updated_at();

-- ── Subject registration (BP-01 foundation) ─────────────────────────────────────
-- Register each Unit in organisation_subjects as 'organisation_unit', mirroring
-- the organisations pattern, so canonical facts can reference it by a single FK.
CREATE OR REPLACE FUNCTION register_organisation_unit_subject()
RETURNS trigger AS $$
DECLARE existing_kind text;
BEGIN
  SELECT subject_kind INTO existing_kind FROM organisation_subjects WHERE subject_id = NEW.id;
  IF existing_kind IS NULL THEN
    INSERT INTO organisation_subjects (subject_id, subject_kind) VALUES (NEW.id, 'organisation_unit');
  ELSIF existing_kind <> 'organisation_unit' THEN
    RAISE EXCEPTION 'cannot create organisation unit %: subject id already registered as kind %', NEW.id, existing_kind
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS organisation_units_register_subject_trigger ON organisation_units;
CREATE TRIGGER organisation_units_register_subject_trigger
  BEFORE INSERT ON organisation_units
  FOR EACH ROW EXECUTE FUNCTION register_organisation_unit_subject();

-- Kind-checked composite FK: a Unit id must be registered specifically as
-- 'organisation_unit' (same robustness as organisations_subject_fk).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organisation_units_subject_fk') THEN
    ALTER TABLE organisation_units
      ADD CONSTRAINT organisation_units_subject_fk
      FOREIGN KEY (id, subject_kind)
      REFERENCES organisation_subjects (subject_id, subject_kind);
  END IF;
END $$;

-- ── Constitutive-containment integrity (BP-02 §7) ───────────────────────────────
-- Enforces, on insert and on any re-parenting:
--   * an existing Unit's organisation_id cannot change (no cross-org movement);
--   * parent (when set) exists and is not soft-deleted;
--   * parent belongs to the SAME organisation (no cross-org nesting);
--   * no circular ancestry (a Unit cannot be its own ancestor).
-- Self-parenting is already blocked by the CHECK above; this also covers deeper cycles.
CREATE OR REPLACE FUNCTION organisation_units_containment_guard()
RETURNS trigger AS $$
DECLARE parent_org uuid; walker uuid; hops int := 0;
BEGIN
  -- Cross-Organisation movement is not defined in BP-02: once a Unit exists, the
  -- containing organisation_id is immutable through ordinary update. Reorganisation
  -- WITHIN the same organisation via parent_unit_id remains allowed (below).
  IF TG_OP = 'UPDATE' AND NEW.organisation_id IS DISTINCT FROM OLD.organisation_id THEN
    RAISE EXCEPTION 'unit %: containing organisation_id cannot be changed (cross-organisation movement is not defined in BP-02)', NEW.id;
  END IF;

  IF NEW.parent_unit_id IS NOT NULL THEN
    SELECT organisation_id INTO parent_org
      FROM organisation_units WHERE id = NEW.parent_unit_id AND deleted_at IS NULL;
    IF parent_org IS NULL THEN
      RAISE EXCEPTION 'parent unit % does not exist or is deleted', NEW.parent_unit_id;
    END IF;
    IF parent_org <> NEW.organisation_id THEN
      RAISE EXCEPTION 'parent unit % belongs to a different organisation than unit %', NEW.parent_unit_id, NEW.id;
    END IF;
    -- Walk up the ancestry chain; if we reach NEW.id, a cycle would form.
    walker := NEW.parent_unit_id;
    WHILE walker IS NOT NULL LOOP
      IF walker = NEW.id THEN
        RAISE EXCEPTION 'circular unit containment detected involving unit %', NEW.id;
      END IF;
      hops := hops + 1;
      IF hops > 10000 THEN
        RAISE EXCEPTION 'unit ancestry walk exceeded safety bound (possible pre-existing cycle)';
      END IF;
      SELECT parent_unit_id INTO walker FROM organisation_units WHERE id = walker;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS organisation_units_containment_guard_trigger ON organisation_units;
CREATE TRIGGER organisation_units_containment_guard_trigger
  BEFORE INSERT OR UPDATE OF parent_unit_id, organisation_id ON organisation_units
  FOR EACH ROW EXECUTE FUNCTION organisation_units_containment_guard();

-- App-layer authorization only (matches organisations); RLS deny-anon.
ALTER TABLE organisation_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organisation_units_no_anon ON organisation_units;
CREATE POLICY organisation_units_no_anon ON organisation_units
  FOR ALL TO anon USING (false) WITH CHECK (false);

NOTIFY pgrst, 'reload schema';

-- ── Rollback ────────────────────────────────────────────────────────────────────
--   DROP TABLE IF EXISTS organisation_units;   -- also drops its triggers/constraints
--   DROP FUNCTION IF EXISTS set_organisation_units_updated_at();
--   DROP FUNCTION IF EXISTS register_organisation_unit_subject();
--   DROP FUNCTION IF EXISTS organisation_units_containment_guard();
--   -- organisation_subjects rows with kind 'organisation_unit' (if any units were
--   -- created) would remain; delete them explicitly if a full teardown is intended:
--   --   DELETE FROM organisation_subjects WHERE subject_kind = 'organisation_unit';
--   (No organisations data is touched by this migration.)
