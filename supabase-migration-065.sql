-- Migration 065: Add topic to campaigns, campaign_groups, surveys
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Campaigns, Campaign Groups, and Surveys required a Brand to generate a
-- name/slug, so a study with no real brand (e.g. "Women's World Cup") had
-- to invent one. Research Projects already solves this with an optional
-- Topic field alongside Brand — Topic is used whenever Brand is left
-- blank. This brings the other three in line: Brand becomes optional
-- everywhere, and Topic fills the same role Research Projects already
-- established.

ALTER TABLE campaigns       ADD COLUMN IF NOT EXISTS topic text;
ALTER TABLE campaign_groups ADD COLUMN IF NOT EXISTS topic text;
ALTER TABLE surveys         ADD COLUMN IF NOT EXISTS topic text;

-- Rollback:
--   ALTER TABLE campaigns       DROP COLUMN IF EXISTS topic;
--   ALTER TABLE campaign_groups DROP COLUMN IF EXISTS topic;
--   ALTER TABLE surveys         DROP COLUMN IF EXISTS topic;
