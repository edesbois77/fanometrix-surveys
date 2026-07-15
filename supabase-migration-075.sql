-- Migration 075: Simulation — permanent research_mode classification
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Phase 1 of the Demo Projects blueprint (Simulation capability,
-- Demo Projects V1 product surface — see blueprint §00 naming note).
-- Every Research Project is now permanently classified at creation as
-- either 'real' or 'simulated'. This is a pure integrity boundary, not
-- a workflow flag — nothing in the Workspace, Intelligence, or Report
-- screens branches on it; it exists only for database triggers, API
-- guards, and label rendering added in later phases of this migration
-- series (076–084).
--
-- Deliberately DEFAULT 'real', not defaultless:
--   The application code that will explicitly declare research_mode on
--   every create (Demo Projects Phase 6) does not exist yet. Landing
--   this column NOT NULL with no default would break the live "Create
--   Research Project" flow the moment this migration runs, since
--   today's insert doesn't know this column exists. A default only
--   ever resolves in the safe direction — 'simulated' can still only
--   ever be set by deliberate application code, never by omission or
--   accident, so this loses none of the integrity guarantee while
--   keeping every existing write path working between now and Phase 6.
--   Postgres backfills every existing row and enforces NOT NULL for
--   all future inserts in the same statement (a fast, metadata-only
--   operation for a constant default on modern Postgres) — no separate
--   backfill step needed.
--
-- Then:
--   - add the CHECK constraint restricting the two allowed values
--   - add the immutability trigger — blocks any UPDATE that changes
--     research_mode after insert, so "cannot be edited or converted
--     later" holds even against a direct SQL statement or a future
--     bug in application code, not just an omission from the edit
--     form's payload shape.

-- ── 1. add, with a safe default, backfilling existing rows ─────────────────

ALTER TABLE research_projects
  ADD COLUMN IF NOT EXISTS research_mode text NOT NULL DEFAULT 'real';

-- ── 2. constrain to the two allowed values ──────────────────────────────────

ALTER TABLE research_projects
  ADD CONSTRAINT research_projects_research_mode_check
    CHECK (research_mode IN ('real', 'simulated'));

-- ── 3. immutability trigger ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION prevent_research_mode_change()
RETURNS trigger AS $$
BEGIN
  IF NEW.research_mode IS DISTINCT FROM OLD.research_mode THEN
    RAISE EXCEPTION 'research_mode is permanent and cannot be changed after creation (project %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS research_projects_research_mode_immutable ON research_projects;
CREATE TRIGGER research_projects_research_mode_immutable
  BEFORE UPDATE ON research_projects
  FOR EACH ROW
  EXECUTE FUNCTION prevent_research_mode_change();

-- Rollback:
--   DROP TRIGGER IF EXISTS research_projects_research_mode_immutable ON research_projects;
--   DROP FUNCTION IF EXISTS prevent_research_mode_change();
--   ALTER TABLE research_projects DROP CONSTRAINT IF EXISTS research_projects_research_mode_check;
--   ALTER TABLE research_projects ALTER COLUMN research_mode DROP NOT NULL;
--   ALTER TABLE research_projects DROP COLUMN IF EXISTS research_mode;
