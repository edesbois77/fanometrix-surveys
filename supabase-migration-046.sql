-- Migration 046: Research Projects — inheritable creative design default
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Adds a Creative Design default to research_projects, following the exact
-- same inheritance pattern already used for Survey, dates, target
-- responses, archive settings, and tags: a deployment's own
-- campaigns.creative_design stays NULL to inherit the project's current
-- design (resolved live, not a one-time copy), or a deployment can set its
-- own value to override it.
--
-- "Design" (not "Theme") because this column always stores the id of a
-- specific creative from the catalog in lib/creative-designs.ts (e.g.
-- "fanometrix", "ocean", "classic") — "Theme" is a classification used only
-- to filter that catalog in the picker UI, never persisted anywhere.

ALTER TABLE research_projects ADD COLUMN IF NOT EXISTS creative_design text;
