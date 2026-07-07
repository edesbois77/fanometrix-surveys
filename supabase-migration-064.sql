-- Migration 064: Add created_by_admin to campaigns, campaign_groups, research_projects
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Publishers can now create their own Campaigns, Campaign Groups, and
-- Research Projects, but org-wide visibility (lib/access.ts) previously
-- matched purely on the *_org_id "who is this for" targeting columns —
-- so a publisher targeted by an admin-run, multi-publisher Research
-- Project could see (and edit) that project and its Campaign Group,
-- even though they didn't create it and it may also serve other
-- publishers' campaigns.
--
-- created_by_admin distinguishes "who set this up" from "who it's for":
--   - Research Projects and Campaign Groups an admin creates become fully
--     invisible to publishers, regardless of targeting (they're authoring
--     tools a publisher doesn't need).
--   - Campaigns an admin creates that target a publisher stay visible to
--     that publisher (read-only, labelled in the UI) since those are the
--     actual campaigns running on their platform — they can still monitor
--     responses and use status actions (go live/pause/etc.), just not
--     edit or delete them.
--
-- DEFAULT true means every existing row (all created by admin, before
-- publishers could create anything) is correctly retro-flagged in this
-- same statement. New inserts always explicitly set the real value —
-- see app/api/campaigns/route.ts, app/api/campaign-groups/route.ts,
-- app/api/research-projects/route.ts.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS created_by_admin boolean NOT NULL DEFAULT true;

ALTER TABLE campaign_groups
  ADD COLUMN IF NOT EXISTS created_by_admin boolean NOT NULL DEFAULT true;

ALTER TABLE research_projects
  ADD COLUMN IF NOT EXISTS created_by_admin boolean NOT NULL DEFAULT true;

-- Rollback:
--   ALTER TABLE campaigns DROP COLUMN IF EXISTS created_by_admin;
--   ALTER TABLE campaign_groups DROP COLUMN IF EXISTS created_by_admin;
--   ALTER TABLE research_projects DROP COLUMN IF EXISTS created_by_admin;
