-- Migration 036: creative_theme on campaigns
-- Stores the visual creative theme chosen for a campaign's survey MPU.
-- Nullable — null = default production creative (backward-compatible).
-- Values: one of the 8 theme IDs from the theme gallery.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS creative_theme text;

COMMENT ON COLUMN campaigns.creative_theme IS
  'Optional visual theme for the survey MPU. One of the 8 theme gallery IDs. Null = default production creative.';
