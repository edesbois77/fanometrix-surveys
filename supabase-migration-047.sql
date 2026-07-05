-- Migration 047: Rename campaigns.creative_theme → creative_design
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- This column has only ever stored the id of a specific creative from the
-- design catalog (e.g. "fanometrix", "ocean") — never a "Theme" in the new
-- sense introduced alongside this migration, where Theme is a
-- classification (Fanometrix / Brand / Tournament / Publisher) used purely
-- to filter the design catalog in the picker UI. Renaming for clarity
-- before that Theme→Design picker ships. Non-destructive: every existing
-- value is preserved under the new column name.

ALTER TABLE campaigns RENAME COLUMN creative_theme TO creative_design;

COMMENT ON COLUMN campaigns.creative_design IS
  'Optional visual/layout design for the survey MPU — an id from the catalog in lib/creative-designs.ts. Null = inherit from the linked research_projects.creative_design, or fall back to the classic default creative if neither is set.';
