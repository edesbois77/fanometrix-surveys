-- Migration 044: Research Projects — persist target publishers/countries
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Research Projects need to remember which publishers and countries a
-- study targets, independent of how many deployments have actually been
-- generated so far. Without this, "Generate Deployments" had nothing to
-- read from except a one-off form each time it was clicked, and the
-- project card couldn't show "Publishers: 4 / Countries: 5" until after
-- deployments already existed.
--
-- Fields are nullable-safe (default empty array) for backward compatibility.

ALTER TABLE research_projects
  ADD COLUMN IF NOT EXISTS publishers    text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS country_codes text[] NOT NULL DEFAULT '{}';
