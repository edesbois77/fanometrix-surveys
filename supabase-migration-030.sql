-- Migration 030: Add structured naming fields to campaign_groups
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Enables the standardised naming convention for campaign groups:
--   Display name: [Brand] | [Research Theme] | Global | [Year]
--   Slug example: carlsberg_fan_understanding_global_2026
--
-- Fields are nullable for backward compatibility with existing groups.

ALTER TABLE campaign_groups
  ADD COLUMN IF NOT EXISTS brand_name      text,
  ADD COLUMN IF NOT EXISTS research_theme  text,
  ADD COLUMN IF NOT EXISTS year            text;
