-- Migration 073: Campaign Number — short, friendly identifier for cards
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- QA Round 3: campaign_id (the long slug, e.g. "carlsberg_fan_understanding_
-- uk_football365_2026") stays exactly as it is — it's still the real unique
-- key used in embed URLs and edit screens. This just adds a short, purely
-- cosmetic sequential number for campaign cards, e.g. "Campaign #001247".
-- bigserial backfills existing rows in one pass and keeps assigning the next
-- number to every future insert automatically — no application code ever
-- writes to this column.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS campaign_number bigserial;

-- Rollback:
--   ALTER TABLE campaigns DROP COLUMN IF EXISTS campaign_number;
