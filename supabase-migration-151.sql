-- Migration 151 — ORG-004 BP-02 / IC-04: Canonical Organisation Names
--
-- ⚠ PHASE A — PROPOSED, NOT YET APPLIED TO PRODUCTION. Awaiting control review.
--
-- Canonical Name facts for eligible subjects (Organisation, Organisation Unit).
-- Supports multiple/concurrent/historical names, language/script/form distinctions
-- and represented-world Effective Applicability owned by each Name fact. The legacy
-- organisations.name (and organisation_units.name) become one-way DISPLAY
-- PROJECTIONS of the subject's current primary canonical Name — never removed, so
-- all existing display/selector consumers keep working unchanged.
--
-- AUTHORITY / COMPATIBILITY DIRECTION (documented Tier 2 decision):
--   * The canonical Name fact is authoritative for names, multiplicity, history and
--     applicability going forward.
--   * organisations.name / organisation_units.name are maintained ONE-WAY from the
--     current primary canonical Name by a projection trigger.
--   * A legacy direct write to organisations.name is treated as a CORRECTION of the
--     current primary Name (value updated in place, no fabricated history) via a
--     depth-guarded reroute trigger — so the two representations never diverge even
--     before the Phase B admin UI routes edits through the canonical service.
--   * A genuine represented-world name CHANGE (close current primary with an
--     effective_to, open a new primary with an effective_from) is a canonical-side
--     operation; the projection then follows the new primary. This preserves the
--     R04 correction-vs-change distinction (BP-02 §15).
--
-- Effective Applicability is represented-world time (dates), kept strictly separate
-- from created_at/updated_at (system time). It is NOT a universal History entity.
--
-- Additive, non-destructive, reversible, idempotent. Safe to run more than once.

CREATE TABLE IF NOT EXISTS organisation_names (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id     uuid        NOT NULL,
  -- Eligible BP-02 subjects only. 'organisational_office' is deliberately excluded
  -- (Office is BP-04) so no Name can attach to a non-implemented subject kind.
  subject_kind   text        NOT NULL CHECK (subject_kind IN ('organisation', 'organisation_unit')),
  value          text        NOT NULL CHECK (length(btrim(value)) > 0),
  -- Form distinction (R04). Small reserved set, not a speculative taxonomy.
  name_form      text        NOT NULL DEFAULT 'display'
                   CHECK (name_form IN ('display', 'legal', 'trading', 'short', 'other')),
  language       text,       -- optional BCP-47 tag (e.g. 'en', 'fr-CA')
  script         text,       -- optional ISO 15924 code (e.g. 'Latn')
  -- The single display/primary name that projects down to the legacy column.
  is_primary     boolean     NOT NULL DEFAULT false,
  -- Effective Applicability (reusable pattern): represented-world validity. NULL
  -- start = open/unknown start; NULL end = open/still-applicable. Dates, not system time.
  effective_from date,
  effective_to   date,
  created_at     timestamptz NOT NULL DEFAULT now(),   -- system time, NOT applicability
  updated_at     timestamptz NOT NULL DEFAULT now(),   -- system time, NOT applicability
  deleted_at     timestamptz,
  deleted_by     text,
  -- Interval integrity: an end may not precede a start (open ends allowed).
  CONSTRAINT organisation_names_effective_order
    CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
  -- Composite subject FK (kind-checked): the subject must exist AND be of this kind.
  CONSTRAINT organisation_names_subject_fk
    FOREIGN KEY (subject_id, subject_kind) REFERENCES organisation_subjects (subject_id, subject_kind)
);

CREATE INDEX IF NOT EXISTS idx_organisation_names_subject ON organisation_names (subject_id);
-- At most one primary (display) Name per subject among non-deleted rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_organisation_names_one_primary
  ON organisation_names (subject_id) WHERE is_primary AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION set_organisation_names_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS organisation_names_updated_at_trigger ON organisation_names;
CREATE TRIGGER organisation_names_updated_at_trigger
  BEFORE UPDATE ON organisation_names
  FOR EACH ROW EXECUTE FUNCTION set_organisation_names_updated_at();

-- ── One-way projection: current primary canonical Name → legacy display column ──
CREATE OR REPLACE FUNCTION sync_name_projection()
RETURNS trigger AS $$
DECLARE subj uuid; kind text; v text;
BEGIN
  subj := COALESCE(NEW.subject_id, OLD.subject_id);
  kind := COALESCE(NEW.subject_kind, OLD.subject_kind);
  SELECT value INTO v FROM organisation_names
    WHERE subject_id = subj AND is_primary AND deleted_at IS NULL
    LIMIT 1;
  IF v IS NULL THEN RETURN NULL; END IF;  -- no primary right now: leave last projection intact
  IF kind = 'organisation' THEN
    UPDATE organisations SET name = v WHERE id = subj AND name IS DISTINCT FROM v;
  ELSIF kind = 'organisation_unit' THEN
    UPDATE organisation_units SET name = v WHERE id = subj AND name IS DISTINCT FROM v;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS organisation_names_projection_trigger ON organisation_names;
CREATE TRIGGER organisation_names_projection_trigger
  AFTER INSERT OR UPDATE OR DELETE ON organisation_names
  FOR EACH ROW EXECUTE FUNCTION sync_name_projection();

-- ── Birth seed: every new subject gets a primary canonical Name from its column ──
CREATE OR REPLACE FUNCTION seed_primary_name_for_organisation()
RETURNS trigger AS $$
BEGIN
  INSERT INTO organisation_names (subject_id, subject_kind, value, name_form, is_primary)
  SELECT NEW.id, 'organisation', NEW.name, 'display', true
  WHERE NOT EXISTS (
    SELECT 1 FROM organisation_names WHERE subject_id = NEW.id AND is_primary AND deleted_at IS NULL);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS organisations_seed_primary_name_trigger ON organisations;
CREATE TRIGGER organisations_seed_primary_name_trigger
  AFTER INSERT ON organisations
  FOR EACH ROW EXECUTE FUNCTION seed_primary_name_for_organisation();

CREATE OR REPLACE FUNCTION seed_primary_name_for_unit()
RETURNS trigger AS $$
BEGIN
  INSERT INTO organisation_names (subject_id, subject_kind, value, name_form, is_primary)
  SELECT NEW.id, 'organisation_unit', NEW.name, 'display', true
  WHERE NOT EXISTS (
    SELECT 1 FROM organisation_names WHERE subject_id = NEW.id AND is_primary AND deleted_at IS NULL);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS organisation_units_seed_primary_name_trigger ON organisation_units;
CREATE TRIGGER organisation_units_seed_primary_name_trigger
  AFTER INSERT ON organisation_units
  FOR EACH ROW EXECUTE FUNCTION seed_primary_name_for_unit();

-- ── Reroute: a legacy direct write to the display column = correction of primary ──
-- Depth-guarded so the projection trigger's own writes (nested) don't recurse.
CREATE OR REPLACE FUNCTION reroute_legacy_name_to_canonical()
RETURNS trigger AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;   -- nested (from projection) → ignore
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE organisation_names SET value = NEW.name
      WHERE subject_id = NEW.id AND is_primary AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS organisations_name_reroute_trigger ON organisations;
CREATE TRIGGER organisations_name_reroute_trigger
  AFTER UPDATE OF name ON organisations
  FOR EACH ROW EXECUTE FUNCTION reroute_legacy_name_to_canonical();

DROP TRIGGER IF EXISTS organisation_units_name_reroute_trigger ON organisation_units;
CREATE OR REPLACE FUNCTION reroute_legacy_unit_name_to_canonical()
RETURNS trigger AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE organisation_names SET value = NEW.name
      WHERE subject_id = NEW.id AND is_primary AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER organisation_units_name_reroute_trigger
  AFTER UPDATE OF name ON organisation_units
  FOR EACH ROW EXECUTE FUNCTION reroute_legacy_unit_name_to_canonical();

-- ── Backfill: seed a primary canonical Name for every existing subject ──────────
-- Deterministic: one primary 'display' Name per existing Organisation (all 84,
-- soft-deleted included) and any existing Unit, valued from its current column.
-- Idempotent via the NOT EXISTS guard + the one-primary partial unique index.
INSERT INTO organisation_names (subject_id, subject_kind, value, name_form, is_primary)
SELECT o.id, 'organisation', o.name, 'display', true
FROM organisations o
WHERE NOT EXISTS (
  SELECT 1 FROM organisation_names n WHERE n.subject_id = o.id AND n.is_primary AND n.deleted_at IS NULL);

INSERT INTO organisation_names (subject_id, subject_kind, value, name_form, is_primary)
SELECT u.id, 'organisation_unit', u.name, 'display', true
FROM organisation_units u
WHERE NOT EXISTS (
  SELECT 1 FROM organisation_names n WHERE n.subject_id = u.id AND n.is_primary AND n.deleted_at IS NULL);

ALTER TABLE organisation_names ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organisation_names_no_anon ON organisation_names;
CREATE POLICY organisation_names_no_anon ON organisation_names
  FOR ALL TO anon USING (false) WITH CHECK (false);

NOTIFY pgrst, 'reload schema';

-- ── Rollback ────────────────────────────────────────────────────────────────────
--   DROP TRIGGER IF EXISTS organisations_seed_primary_name_trigger ON organisations;
--   DROP TRIGGER IF EXISTS organisations_name_reroute_trigger ON organisations;
--   DROP TRIGGER IF EXISTS organisation_units_seed_primary_name_trigger ON organisation_units;
--   DROP TRIGGER IF EXISTS organisation_units_name_reroute_trigger ON organisation_units;
--   DROP FUNCTION IF EXISTS seed_primary_name_for_organisation();
--   DROP FUNCTION IF EXISTS seed_primary_name_for_unit();
--   DROP FUNCTION IF EXISTS reroute_legacy_name_to_canonical();
--   DROP FUNCTION IF EXISTS reroute_legacy_unit_name_to_canonical();
--   DROP FUNCTION IF EXISTS sync_name_projection();
--   DROP FUNCTION IF EXISTS set_organisation_names_updated_at();
--   DROP TABLE IF EXISTS organisation_names;
--   (organisations.name / organisation_units.name retain their last projected value;
--    no legacy display data is lost.)
