-- Migration 023: Add group and market context to responses
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Captures richer context when a response is submitted from a group embed:
--   group_id       : campaign group slug (null for single-campaign embeds)
--   country_code   : ISO 3166-1 alpha-2 from embed URL, e.g. "GB"
--   market         : market name from campaign or embed URL, e.g. "United Kingdom"
--   survey_language: language the survey was rendered in, e.g. "en", "de"
--
-- This enables cross-market aggregation — responses can be grouped by country
-- or market without relying solely on the ad-server country string.
--
-- ROLLBACK:
-- ALTER TABLE responses
--   DROP COLUMN IF EXISTS group_id,
--   DROP COLUMN IF EXISTS country_code,
--   DROP COLUMN IF EXISTS market,
--   DROP COLUMN IF EXISTS survey_language;

ALTER TABLE responses
  ADD COLUMN IF NOT EXISTS group_id        text,
  ADD COLUMN IF NOT EXISTS country_code    text,
  ADD COLUMN IF NOT EXISTS market          text,
  ADD COLUMN IF NOT EXISTS survey_language text;

-- Index for fast group-level queries in reporting
CREATE INDEX IF NOT EXISTS idx_responses_group_id
  ON responses (group_id)
  WHERE group_id IS NOT NULL;
