-- Migration 052: Create organisations table
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- First-class Organisations model (User Management v2, Phase 1). This
-- supersedes the bare-bones `publishers` registry table (id, name only)
-- and becomes the canonical source of truth for Publisher, Brand, Agency,
-- and Internal organisations across the platform. Existing free-text
-- publisher/brand_name columns on campaigns, campaign_groups, and
-- research_projects are converted to organisation_id foreign keys later
-- in this same migration set (supabase-migration-057.sql), after this
-- table has been seeded from that existing data
-- (supabase-migration-053.sql).

CREATE TABLE IF NOT EXISTS organisations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  type        text        NOT NULL CHECK (type IN ('publisher', 'agency', 'brand', 'internal')),
  status      text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  deleted_by  text
);

-- Case-insensitive uniqueness on name, ignoring soft-deleted rows (so a
-- deleted organisation's name can be reused).
CREATE UNIQUE INDEX IF NOT EXISTS idx_organisations_name_ci
  ON organisations (LOWER(name)) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_organisations_type ON organisations (type);
CREATE INDEX IF NOT EXISTS idx_organisations_deleted_at ON organisations (deleted_at);

CREATE OR REPLACE FUNCTION set_organisations_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS organisations_updated_at_trigger ON organisations;
CREATE TRIGGER organisations_updated_at_trigger
  BEFORE UPDATE ON organisations
  FOR EACH ROW
  EXECUTE FUNCTION set_organisations_updated_at();

-- Admin/service-role only — matches users, research_projects, publishers.
-- Access control happens at the API layer via requireUser()/lib/access.ts,
-- not via RLS (see supabase-migration-043.sql for the established
-- rationale: brand/agency/publisher read scoping depends on application
-- logic, not row-level policies).
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_anon" ON organisations USING (false);

-- Rollback:
--   DROP TABLE IF EXISTS organisations;
--   DROP FUNCTION IF EXISTS set_organisations_updated_at();
