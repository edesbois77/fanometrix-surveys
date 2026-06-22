-- Migration 029: Add structured naming fields to campaigns
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Enables the standardised naming convention for campaigns:
--   Display name: [Brand] | [Research Theme] | [Country] | [Publisher] | [Year]
--   Slug example: carlsberg_fan_understanding_uk_football365_2026
--
-- Fields are nullable for backward compatibility with existing campaigns.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS research_theme  text,
  ADD COLUMN IF NOT EXISTS year            text;
