-- Migration 071: Research Project — Confidentiality & Version
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Small additive follow-up to migration 070's Research Brief work — two
-- fields for the new "Project Information" section, both squarely
-- strategic/administrative metadata about the project itself, not
-- operational campaign settings:
--
-- - confidentiality: Public / Internal / Confidential. Nullable — existing
--   projects simply show "—" until someone sets it.
-- - version: free-text label (e.g. "v1", "Draft 2") — not a real revision-
--   tracking system, just a label the team can set and see.

ALTER TABLE research_projects
  ADD COLUMN IF NOT EXISTS confidentiality text
    CHECK (confidentiality IN ('public', 'internal', 'confidential')),
  ADD COLUMN IF NOT EXISTS version text;

-- Rollback:
--   ALTER TABLE research_projects DROP COLUMN IF EXISTS confidentiality, DROP COLUMN IF EXISTS version;
