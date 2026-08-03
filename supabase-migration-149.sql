-- Migration 149 — ORG-004 BP-01: Organisational Subject Foundation (IC-01) +
-- Organisation Core registration (IC-02)
--
-- This is the Foundation & Compatibility package of the Organisations programme.
-- It is deliberately narrow. It establishes the *technical* mechanism that
-- future canonical organisational facts (Names, Identifiers, Classifications,
-- Relationships, Offices, Authority — none of which are implemented here) will
-- use to refer to a subject, and registers the existing Organisation root as the
-- first such subject. Nothing about the existing Organisations model changes.
--
-- WHAT THIS IS
--   `organisation_subjects` is common referencing infrastructure. The
--   Organisations architecture allows a fact to attach to one of three eligible
--   subject types — Organisation, Organisation Unit, Organisational Office. Units
--   and Offices do not exist yet and are NOT created here; only their subject
--   kinds are reserved so later packages can register them without reshaping this
--   table. Future fact tables will FK to organisation_subjects.subject_id, so a
--   single foreign key can point at whichever subject type a fact concerns.
--
-- WHAT THIS IS NOT (explicit non-goals, enforced by keeping the table attribute-free)
--   * Not a domain entity. There is no "OrganisationalSubject" concept in the
--     product; this is an internal identity anchor with no name, status, type or
--     any other domain attribute, no API and no UI.
--   * `subject_kind` is a TECHNICAL discriminator (which concrete subject table a
--     row lives in) — it is NOT canonical Classification (publisher / agency /
--     club / league …). Classification arrives in a later package and is a
--     separate, richer model.
--   * Not an Identifier. subject_id is an internal technical uuid equal to the
--     subject's own row id; it is not an external/canonical Identifier and must
--     not be surfaced as one.
--   * Not a Relationship (a single subject per row, no pairing), not Effective
--     Applicability, not history/status/continuity.
--
-- INTEGRITY (BP-01 control-review remediation)
--   The registry is authoritative for *which kind* a subject is, not just that a
--   subject id exists. An Organisation may therefore only exist where its
--   registry row is kind='organisation'. This is enforced structurally by a
--   COMPOSITE foreign key on (id, subject_kind) — not merely on the id — so a
--   uuid already registered as an Organisation Unit or Organisational Office can
--   never back an Organisation row, even via direct SQL or a disabled trigger.
--   The backfill fails loudly on any pre-existing kind conflict, and the insert
--   trigger raises an explicit error rather than silently skipping one.
--
-- COMPATIBILITY
--   organisations.id, name, type, status and soft-deletion are untouched. No
--   existing organisations row is modified (the new subject_kind column is a
--   constant 'organisation' technical discriminator, defaulted for every existing
--   row). Existing Organisations APIs/UI, Platform Authorisation (org
--   active/disabled behaviour) and every downstream FK (campaigns.*_org_id,
--   surveys.*_org_id, research_projects.*_org_id[s], creative_designs,
--   library_documents/owner_org_id, partner_reports …) keep working exactly as
--   before — none of them reference this new table.
--
-- SHAPE OF THE CHANGE
--   * new table organisation_subjects (identity registry, unique on id+kind)
--   * every existing organisation (including the 5 soft-deleted ones — identity
--     persists) gets a mirror row via a one-off backfill that ABORTS on conflict
--   * organisations gains a constant subject_kind='organisation' discriminator
--   * a BEFORE INSERT trigger on organisations auto-registers each new
--     organisation, and fails explicitly on a cross-kind uuid collision
--   * a COMPOSITE FK organisations(id, subject_kind) ->
--     organisation_subjects(subject_id, subject_kind) makes the registry
--     authoritative for the Organisation root, pinned to kind='organisation'
--
-- Additive, backward compatible, and reversible (see Rollback). Safe to run more
-- than once.

-- ── IC-01: subject-reference infrastructure ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS organisation_subjects (
  -- Equal to the concrete subject's own id (for an Organisation, = organisations.id).
  -- NOT defaulted: callers/triggers always supply the subject's id. This is the
  -- shared-identity ("supertype anchor") pattern — the subject id IS the id.
  subject_id   uuid        PRIMARY KEY,
  -- Technical discriminator only. Reserving 'organisation_unit' /
  -- 'organisational_office' does not create those subjects — no such rows or
  -- tables exist in BP-01. NOT a domain Classification.
  subject_kind text        NOT NULL CHECK (subject_kind IN ('organisation', 'organisation_unit', 'organisational_office')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- Unique target for the composite FK below. subject_id is already unique on its
  -- own (PK); this exposes (subject_id, subject_kind) as a referenceable key so a
  -- child row can require BOTH the id and a specific kind.
  CONSTRAINT organisation_subjects_id_kind_key UNIQUE (subject_id, subject_kind)
);

CREATE INDEX IF NOT EXISTS idx_organisation_subjects_kind
  ON organisation_subjects (subject_kind);

-- ── IC-02: register the Organisation root as a subject ──────────────────────────
-- One-off backfill of every existing organisation, soft-deleted included
-- (subject identity is not a lifecycle flag; a deleted org's identity still
-- exists). Fail loudly if any organisation id is already registered under a
-- different subject_kind — such a conflict must be resolved by control, never
-- silently accepted.
DO $$
DECLARE conflicting int;
BEGIN
  SELECT count(*) INTO conflicting
    FROM organisations o
    JOIN organisation_subjects s ON s.subject_id = o.id
    WHERE s.subject_kind <> 'organisation';
  IF conflicting > 0 THEN
    RAISE EXCEPTION
      'BP-01 backfill aborted: % organisation id(s) already registered under a non-organisation subject_kind', conflicting;
  END IF;

  -- Only ever skips rows already correctly present as 'organisation' (idempotent
  -- re-run); a cross-kind conflict would already have raised above.
  INSERT INTO organisation_subjects (subject_id, subject_kind)
  SELECT id, 'organisation' FROM organisations
  ON CONFLICT (subject_id) DO NOTHING;
END $$;

-- Constant technical discriminator on the root. Always 'organisation' (CHECK), so
-- it can carry into the composite FK without ever being anything else. Existing
-- rows are filled with the default; the create API (INSERT {name,type}) omits it.
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS subject_kind text NOT NULL DEFAULT 'organisation'
  CHECK (subject_kind = 'organisation');

-- Keep the registry in sync on new organisation creation. BEFORE INSERT so the
-- parent subject row exists before the organisations row is written and its FK
-- (below) is checked. Idempotent for the normal case, and EXPLICITLY refuses a
-- uuid already registered under another kind rather than silently doing nothing.
CREATE OR REPLACE FUNCTION register_organisation_subject()
RETURNS trigger AS $$
DECLARE existing_kind text;
BEGIN
  SELECT subject_kind INTO existing_kind
    FROM organisation_subjects WHERE subject_id = NEW.id;

  IF existing_kind IS NULL THEN
    INSERT INTO organisation_subjects (subject_id, subject_kind)
    VALUES (NEW.id, 'organisation');
  ELSIF existing_kind <> 'organisation' THEN
    RAISE EXCEPTION
      'cannot create organisation %: subject id already registered as kind %', NEW.id, existing_kind
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  -- existing_kind = 'organisation' → already registered; no-op (idempotent).
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS organisations_register_subject_trigger ON organisations;
CREATE TRIGGER organisations_register_subject_trigger
  BEFORE INSERT ON organisations
  FOR EACH ROW
  EXECUTE FUNCTION register_organisation_subject();

-- Make the registry authoritative for the Organisation root, KIND-CHECKED: every
-- organisation must reference a registry row that is specifically kind
-- 'organisation'. Composite (id, subject_kind) — not id alone — closes the gap
-- where a non-organisation subject with the same uuid could satisfy the FK.
-- Validated against existing data at creation time; the backfill above and the
-- constant column guarantee all current rows satisfy it. Guarded so re-running
-- the migration does not error on an already-present FK.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organisations_subject_fk'
  ) THEN
    ALTER TABLE organisations
      ADD CONSTRAINT organisations_subject_fk
      FOREIGN KEY (id, subject_kind)
      REFERENCES organisation_subjects (subject_id, subject_kind);
  END IF;
END $$;

-- Infra table: no direct anon/authenticated access (service role bypasses RLS).
-- No app code reads this table in BP-01; consumers arrive in later packages.
ALTER TABLE organisation_subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organisation_subjects_no_anon ON organisation_subjects;
CREATE POLICY organisation_subjects_no_anon ON organisation_subjects
  FOR ALL TO anon USING (false) WITH CHECK (false);

NOTIFY pgrst, 'reload schema';

-- ── Rollback ────────────────────────────────────────────────────────────────────
--   ALTER TABLE organisations DROP CONSTRAINT IF EXISTS organisations_subject_fk;
--   ALTER TABLE organisations DROP COLUMN IF EXISTS subject_kind;
--   DROP TRIGGER IF EXISTS organisations_register_subject_trigger ON organisations;
--   DROP FUNCTION IF EXISTS register_organisation_subject();
--   DROP TABLE IF EXISTS organisation_subjects;
--   (No pre-existing organisations data was ever modified — subject_kind is a
--    constant added column — so rollback loses no Organisation data.)
