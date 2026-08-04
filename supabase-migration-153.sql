-- Migration 153 — ORG-004 BP-02 / IC-04: Classification (Schemes, Categories, Assignments)
--
-- ⚠ PHASE A — PROPOSED, NOT YET APPLIED TO PRODUCTION. Awaiting control review.
--
-- Governed Classification: scheme-defined category membership for eligible subjects
-- (Organisation, Organisation Unit). Adding a new category is a row INSERT into
-- classification_categories — NO schema migration required (BP-02 §12). This is NOT
-- a key/value metadata store: memberships must reference a defined category (FK), and
-- scheme/category governance is controlled (is_system rows are protected; creation is
-- an admin-only surface in Phase B).
--
-- LEGACY type COMPATIBILITY (BP-02 §11, documented Tier 2 decision):
--   * organisations.type is NOT removed and keeps working for existing selectors.
--   * The minimum scheme needed to represent the legitimate legacy commercial values
--     is seeded: scheme 'organisation_category' with categories Brand / Agency /
--     Publisher only.
--   * organisations.type stays the authoritative legacy field during transition; the
--     organisation_category assignment is mirrored ONE-WAY from it (seed + live
--     trigger). Richer schemes (e.g. an Agency Specialism scheme) are canonical-only
--     and added later via the admin surface with no migration.
--
--   * 'internal' is DELIBERATELY NOT mapped (control-resolved; no Internal category is
--     created). It is a platform/operational marker, not a real-world category peer of
--     Brand/Agency/Publisher. organisations.type='internal' is preserved untouched for
--     compatibility. "The Football Collective" (platform operator) may remain without an
--     organisation_category assignment. "PlayStation" is evidentially a Brand but is NOT
--     silently corrected here — it is recorded as an explicit legacy-data correction item
--     for separate controlled treatment (see Phase A report §O/§P). This migration makes
--     no type/classification change for either internal organisation.
--
-- HISTORY PRESERVATION (control Tier 2 remediation A): a genuine legacy type change
-- retires the superseded organisation_category fact via Effective Applicability
-- (effective_to) rather than deleting it, keeping one CURRENT assignment. See the mirror
-- trigger and the uq_classification_assignment_current index below.
--
-- INTERVAL CONVENTION (control Tier 2 remediation, temporal boundary): BP-02 Effective
-- Applicability is a HALF-OPEN interval [effective_from, effective_to) — from inclusive,
-- to exclusive; effective_to IS NULL = open/current. Retiring the former category with
-- effective_to = CURRENT_DATE and starting the replacement with effective_from =
-- CURRENT_DATE is therefore non-overlapping and deterministic: on the transition date the
-- former is NOT applicable and only the replacement is. Zero-length [d,d) intervals are
-- disallowed (CHECK uses effective_to > effective_from); a same-day supersession is a
-- correction (soft-deleted), not empty history.
--
-- Additive, non-destructive, reversible, idempotent. Safe to run more than once.

CREATE TABLE IF NOT EXISTS classification_schemes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text        NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9_]+$'),
  label       text        NOT NULL,
  description text,
  is_system   boolean     NOT NULL DEFAULT false,   -- protected: not user-deletable
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS classification_categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id   uuid        NOT NULL REFERENCES classification_schemes (id) ON DELETE CASCADE,
  key         text        NOT NULL CHECK (key ~ '^[a-z0-9_]+$'),
  label       text        NOT NULL,
  description text,
  sort_order  int         NOT NULL DEFAULT 0,
  is_system   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scheme_id, key)
);
CREATE INDEX IF NOT EXISTS idx_classification_categories_scheme ON classification_categories (scheme_id);

CREATE TABLE IF NOT EXISTS classification_assignments (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id     uuid        NOT NULL,
  subject_kind   text        NOT NULL CHECK (subject_kind IN ('organisation', 'organisation_unit')),
  category_id    uuid        NOT NULL REFERENCES classification_categories (id),
  -- Half-open [effective_from, effective_to): from inclusive, to exclusive. See 151.
  effective_from date,
  effective_to   date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  deleted_by     text,
  -- Interval integrity (half-open): end strictly after start when both set; no [d,d).
  CONSTRAINT classification_assignments_effective_order
    CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from),
  CONSTRAINT classification_assignments_subject_fk
    FOREIGN KEY (subject_id, subject_kind) REFERENCES organisation_subjects (subject_id, subject_kind)
);
CREATE INDEX IF NOT EXISTS idx_classification_assignments_subject  ON classification_assignments (subject_id);
CREATE INDEX IF NOT EXISTS idx_classification_assignments_category ON classification_assignments (category_id);
-- At most one CURRENT membership per (subject, category). "Current" = not soft-deleted
-- AND not retired (open effective_to). Retired rows (effective_to set) are excluded, so
-- the same category may be held historically many times and legitimately re-established
-- later — while a genuine type change retires the prior fact instead of deleting it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_classification_assignment_current
  ON classification_assignments (subject_id, category_id)
  WHERE deleted_at IS NULL AND effective_to IS NULL;

-- updated_at maintenance for all three.
CREATE OR REPLACE FUNCTION set_classification_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS classification_schemes_updated_at ON classification_schemes;
CREATE TRIGGER classification_schemes_updated_at BEFORE UPDATE ON classification_schemes
  FOR EACH ROW EXECUTE FUNCTION set_classification_updated_at();
DROP TRIGGER IF EXISTS classification_categories_updated_at ON classification_categories;
CREATE TRIGGER classification_categories_updated_at BEFORE UPDATE ON classification_categories
  FOR EACH ROW EXECUTE FUNCTION set_classification_updated_at();
DROP TRIGGER IF EXISTS classification_assignments_updated_at ON classification_assignments;
CREATE TRIGGER classification_assignments_updated_at BEFORE UPDATE ON classification_assignments
  FOR EACH ROW EXECUTE FUNCTION set_classification_updated_at();

-- Governance: system schemes/categories cannot be deleted (keeps the legacy-compat
-- organisation_category scheme stable). User-defined ones remain freely manageable.
CREATE OR REPLACE FUNCTION protect_system_classification()
RETURNS trigger AS $$
BEGIN
  IF OLD.is_system THEN
    RAISE EXCEPTION 'cannot delete a system classification row (%.%)', TG_TABLE_NAME, OLD.id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS classification_schemes_protect ON classification_schemes;
CREATE TRIGGER classification_schemes_protect BEFORE DELETE ON classification_schemes
  FOR EACH ROW EXECUTE FUNCTION protect_system_classification();
DROP TRIGGER IF EXISTS classification_categories_protect ON classification_categories;
CREATE TRIGGER classification_categories_protect BEFORE DELETE ON classification_categories
  FOR EACH ROW EXECUTE FUNCTION protect_system_classification();

-- ── Seed the minimum legacy-compat scheme + categories ──────────────────────────
INSERT INTO classification_schemes (key, label, description, is_system)
VALUES ('organisation_category', 'Organisation Category',
        'Primary real-world category of an organisation. Seeded from the legacy organisations.type compatibility field (Brand/Agency/Publisher).', true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO classification_categories (scheme_id, key, label, is_system, sort_order)
SELECT s.id, v.key, v.label, true, v.ord
FROM classification_schemes s
CROSS JOIN (VALUES ('brand','Brand',1), ('agency','Agency',2), ('publisher','Publisher',3)) AS v(key, label, ord)
WHERE s.key = 'organisation_category'
ON CONFLICT (scheme_id, key) DO NOTHING;

-- ── Backfill: assign each non-internal organisation to its matching category ─────
-- Covers brand/agency/publisher only (incl. soft-deleted subjects, which already
-- exist in the registry). 'internal' is intentionally excluded (see header + report).
INSERT INTO classification_assignments (subject_id, subject_kind, category_id)
SELECT o.id, 'organisation', c.id
FROM organisations o
JOIN classification_schemes s ON s.key = 'organisation_category'
JOIN classification_categories c ON c.scheme_id = s.id AND c.key = o.type
WHERE o.type IN ('brand', 'agency', 'publisher')
  AND NOT EXISTS (
    SELECT 1 FROM classification_assignments a
    WHERE a.subject_id = o.id AND a.category_id = c.id AND a.deleted_at IS NULL);

-- ── Live one-way mirror: organisations.type → organisation_category assignment ──
-- A genuine legacy type change RETIRES the superseded canonical Classification fact
-- (sets effective_to) and keeps it as history — it is never physically deleted — while
-- maintaining exactly one CURRENT organisation_category assignment. organisations.type
-- remains the compatibility driver.
CREATE OR REPLACE FUNCTION sync_org_category_assignment()
RETURNS trigger AS $$
DECLARE scheme uuid; new_cat uuid;
BEGIN
  -- 'internal' (and any non-commercial value) is intentionally not mirrored.
  IF NEW.type NOT IN ('brand', 'agency', 'publisher') THEN
    RETURN NEW;
  END IF;
  SELECT id INTO scheme FROM classification_schemes WHERE key = 'organisation_category';
  SELECT id INTO new_cat FROM classification_categories WHERE scheme_id = scheme AND key = NEW.type;
  IF new_cat IS NULL THEN RETURN NEW; END IF;

  -- Retire (do NOT delete) any CURRENT organisation_category membership that is not the
  -- new category and was applicable BEFORE today: close its half-open interval at
  -- CURRENT_DATE so it stays as history (not applicable on/after today) and does not
  -- overlap the replacement that begins today. effective_from NULL = open/earlier start.
  UPDATE classification_assignments a
    SET effective_to = CURRENT_DATE
    FROM classification_categories c
    WHERE a.subject_id = NEW.id AND a.category_id = c.id AND c.scheme_id = scheme
      AND a.category_id <> new_cat
      AND a.deleted_at IS NULL AND a.effective_to IS NULL
      AND (a.effective_from IS NULL OR a.effective_from < CURRENT_DATE);

  -- A membership that STARTED today and is superseded today was never applicable for any
  -- day (a zero-length [d,d) interval, disallowed by the half-open convention): treat it
  -- as a correction and soft-delete it rather than record empty history.
  UPDATE classification_assignments a
    SET deleted_at = now(), deleted_by = 'system:type_mirror'
    FROM classification_categories c
    WHERE a.subject_id = NEW.id AND a.category_id = c.id AND c.scheme_id = scheme
      AND a.category_id <> new_cat
      AND a.deleted_at IS NULL AND a.effective_to IS NULL
      AND a.effective_from = CURRENT_DATE;

  -- Ensure exactly one CURRENT assignment for the new category (re-establishing a
  -- previously retired category creates a fresh current fact; existing history is kept).
  INSERT INTO classification_assignments (subject_id, subject_kind, category_id, effective_from)
  SELECT NEW.id, 'organisation', new_cat, CURRENT_DATE
  WHERE NOT EXISTS (
    SELECT 1 FROM classification_assignments a
    WHERE a.subject_id = NEW.id AND a.category_id = new_cat
      AND a.deleted_at IS NULL AND a.effective_to IS NULL);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS organisations_sync_category_trigger ON organisations;
CREATE TRIGGER organisations_sync_category_trigger
  AFTER INSERT OR UPDATE OF type ON organisations
  FOR EACH ROW EXECUTE FUNCTION sync_org_category_assignment();

ALTER TABLE classification_schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE classification_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE classification_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS classification_schemes_no_anon ON classification_schemes;
CREATE POLICY classification_schemes_no_anon ON classification_schemes FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS classification_categories_no_anon ON classification_categories;
CREATE POLICY classification_categories_no_anon ON classification_categories FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS classification_assignments_no_anon ON classification_assignments;
CREATE POLICY classification_assignments_no_anon ON classification_assignments FOR ALL TO anon USING (false) WITH CHECK (false);

NOTIFY pgrst, 'reload schema';

-- ── Rollback ────────────────────────────────────────────────────────────────────
--   DROP TRIGGER IF EXISTS organisations_sync_category_trigger ON organisations;
--   DROP FUNCTION IF EXISTS sync_org_category_assignment();
--   DROP FUNCTION IF EXISTS protect_system_classification();
--   DROP FUNCTION IF EXISTS set_classification_updated_at();
--   DROP TABLE IF EXISTS classification_assignments;
--   DROP TABLE IF EXISTS classification_categories;
--   DROP TABLE IF EXISTS classification_schemes;
--   (organisations.type is never modified by this migration.)
