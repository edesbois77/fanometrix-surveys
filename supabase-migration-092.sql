-- Migration 092: Product Walkthrough — client_label, internal_notes on research_projects
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Correcting the Product Walkthrough creation flow (Library creates an
-- empty container only; everything else is built inside the workspace
-- itself). The new creation drawer collects an optional "Client/Prospect"
-- label and an optional "Internal Note" — neither maps cleanly onto an
-- existing column: research_projects.description is already used
-- elsewhere as a *campaign* description default (seeded into the
-- Deployment Wizard's "Campaign Defaults" step), so reusing it here would
-- quietly collide with that existing meaning. Both new columns are plain
-- nullable metadata — no constraints, no triggers, no change to the
-- real/simulated provenance model (migrations 078/084 untouched).

ALTER TABLE research_projects
  ADD COLUMN IF NOT EXISTS client_label text,
  ADD COLUMN IF NOT EXISTS internal_notes text;

-- Rollback:
--   ALTER TABLE research_projects DROP COLUMN IF EXISTS client_label, DROP COLUMN IF EXISTS internal_notes;
