-- Migration 096: Campaign Groups become project-scoped
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Campaign Groups have always been a flat, platform-wide table with no
-- awareness of research_projects (see lib/access.ts's existing comment on
-- the campaign_group branch). Research Projects and Product Walkthroughs
-- can now attach multiple Surveys, each owning its own campaigns, and a
-- Campaign Group is the mechanism that bundles campaigns from more than
-- one of those Surveys behind a single embed code — so it needs to know
-- which one project it belongs to, without becoming a child of any single
-- Survey.
--
-- Nullable, not required by this migration alone: existing groups keep
-- research_project_id = NULL until the Phase 1 backfill (application-level
-- script, not SQL) assigns it where safe to infer, or an admin assigns it
-- by hand. Application code (not this migration) will require the field on
-- every NEWLY created group from this point forward — enforced in
-- app/api/campaign-groups/route.ts, not the database, so legacy NULL rows
-- already in this table are never retroactively invalid.
--
-- ON DELETE RESTRICT, deliberately not SET NULL or CASCADE: deleting a
-- Research Project must never silently demote a live Campaign Group to
-- "unscoped," and must never silently take out a rotation config that
-- other campaigns/publishers still depend on. A project with any Campaign
-- Group still pointing at it cannot be deleted until that group is
-- archived, its members removed, or it's deliberately reassigned first.
--
-- This directly affects lib/simulation/delete-simulated-project.ts, which
-- hard-deletes simulated (Product Walkthrough) research_projects rows —
-- that flow will start failing with a foreign key violation the moment a
-- Walkthrough has a project-scoped Campaign Group, until that function is
-- updated to check for and refuse (or explicitly cascade-handle) that case.
-- Tracked as a required follow-up before this feature ships; not addressed
-- in this migration.

ALTER TABLE campaign_groups
  ADD COLUMN IF NOT EXISTS research_project_id uuid
    REFERENCES research_projects(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_campaign_groups_research_project_id
  ON campaign_groups (research_project_id);

-- Rollback:
--   DROP INDEX IF EXISTS idx_campaign_groups_research_project_id;
--   ALTER TABLE campaign_groups DROP COLUMN IF EXISTS research_project_id;
