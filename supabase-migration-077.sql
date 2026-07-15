-- Migration 077: Simulation — rename social_mentions.is_demo → is_simulated
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Phase 2 (2 of 6) of the Demo Projects blueprint. social_mentions has
-- carried a dead `is_demo boolean` column since migration 034 —
-- confirmed unread and unwritten by any application code (the live
-- real/synthetic signal for mentions today is `import_source`). Rather
-- than add a second, competing column, this reuses it under the name
-- the rest of the schema is standardising on.
--
-- Existing rows: is_demo is already NOT NULL DEFAULT false from
-- migration 034, so every existing mention (including rows with
-- import_source = 'synthetic' from the pre-existing ad-hoc "Generate
-- Sample" QA tool) becomes is_simulated = false here. That tool is
-- explicitly out of scope for this work (blueprint §10) and keeps
-- operating on import_source exactly as it does today — this rename
-- does not change its behaviour, only the name of a column it never
-- touched.

ALTER TABLE social_mentions
  RENAME COLUMN is_demo TO is_simulated;

-- Rollback:
--   ALTER TABLE social_mentions RENAME COLUMN is_simulated TO is_demo;
