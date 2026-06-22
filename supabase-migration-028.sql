-- Migration 028: Add structured naming fields to surveys
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Enables the standardised naming convention for survey templates:
--   Display name: [Brand] - [Research Theme] - v[number]
--   Slug example: carlsberg_fan_understanding_v1
--
-- Fields are nullable for backward compatibility with existing surveys.

ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS brand_name      text,
  ADD COLUMN IF NOT EXISTS research_theme  text,
  ADD COLUMN IF NOT EXISTS version_number  integer NOT NULL DEFAULT 1;
