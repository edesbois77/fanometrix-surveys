-- Migration 022: Add market targeting fields to campaigns
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Enables campaign group embed logic to filter campaigns by country/market.
-- A campaign group may contain multiple campaigns for different markets;
-- setting country_code and market on each campaign means one group iframe
-- can serve the correct campaign per country automatically.
--
-- country_code : ISO 3166-1 alpha-2 code, e.g. "GB", "DE", "SE", "CN"
-- market       : human-readable market name, e.g. "United Kingdom"
--
-- ROLLBACK:
-- ALTER TABLE campaigns
--   DROP COLUMN IF EXISTS country_code,
--   DROP COLUMN IF EXISTS market;

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS market       text;
