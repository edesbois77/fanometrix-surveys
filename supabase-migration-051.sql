-- Migration 051: Publisher qualification fields on access_requests
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Adds 3 optional fields captured when a lead arrives via the /for-publishers
-- journey (role = "Media Partner / Publisher"): audience size, primary
-- markets, and ad server. All optional — the existing form/API/admin view
-- keep working unchanged for every other role.

ALTER TABLE access_requests
  ADD COLUMN IF NOT EXISTS audience_size text
    CHECK (audience_size IN ('Under 1M', '1M-5M', '5M-10M', '10M-50M', '50M+'));

ALTER TABLE access_requests
  ADD COLUMN IF NOT EXISTS ad_server text
    CHECK (ad_server IN ('Google Ad Manager', 'Equativ', 'Xandr', 'Kevel', 'Other'));

ALTER TABLE access_requests
  ADD COLUMN IF NOT EXISTS primary_markets text[];
