-- Migration 113: Snapshot each collection run's configuration.
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Run history is a first-class Fanometrix feature: every collection run is a
-- reproducible, timestamped snapshot. collection_runs already records status,
-- connectors, per-run stats and warnings; this adds the CONFIG that produced it
-- (keywords, markets, languages, date window, enabled connectors and their
-- settings) so a run can be understood — and reproduced — long after the search
-- definition has since changed. Additive; safe to re-run.
ALTER TABLE collection_runs
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}';

-- Rollback:
--   ALTER TABLE collection_runs DROP COLUMN IF EXISTS config;
