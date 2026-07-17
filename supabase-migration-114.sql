-- Migration 114: Relative collection window preset.
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- A conversation search's time period is stored as a RELATIVE preset ('7d',
-- '30d', '90d', '1y') so "Last 90 days" always means the 90 days before each
-- collection run — keeping repeated collections and longitudinal snapshots
-- meaningful. Only 'custom' uses the explicit collect_from / collect_to dates
-- (migration 112). Additive; existing searches default to a rolling 90 days.
ALTER TABLE social_searches
  ADD COLUMN IF NOT EXISTS collect_window text NOT NULL DEFAULT '90d';

-- Rollback:
--   ALTER TABLE social_searches DROP COLUMN IF EXISTS collect_window;
