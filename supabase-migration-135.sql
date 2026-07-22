-- Migration 135: survey_events composite indexes for the dashboard funnel counts
--
-- survey_events has passed 1.1M rows (776k of them SURVEY_RENDER, growing ~15k/hour
-- once campaigns are live). Migration 042 gave it only single-column indexes, so the
-- dashboard's funnel queries -- which always filter campaign_id AND event_type
-- together -- have to bitmap two large index scans and then recheck every candidate
-- row on the heap. At current volume that exceeds the statement timeout: counting
-- SURVEY_RENDER for a single busy campaign takes >8s and is cancelled (57014).
--
-- The API coerces a cancelled count to 0 (`count ?? 0`), so Survey Intelligence
-- renders "Impressions (Loads) 0" while Q1 Answered / Completed -- whose counts are
-- small enough to return -- show real numbers, and every impression-denominated rate
-- collapses to "-".
--
-- These composites let the same queries run as index-only scans over exactly the
-- matching entries.
--
-- Run OUTSIDE a transaction (CONCURRENTLY cannot run inside one). In the Supabase
-- SQL editor, run each statement on its own.

-- Scoped funnel counts + the render time-series:
--   WHERE campaign_id = $1 / IN (...) AND event_type = $2 [AND created_at BETWEEN ...]
--   ORDER BY created_at
CREATE INDEX CONCURRENTLY IF NOT EXISTS survey_events_campaign_type_created_idx
  ON survey_events (campaign_id, event_type, created_at);

-- Unscoped / date-bounded counts (the global dashboard with no campaign filter):
--   WHERE event_type = $1 [AND created_at BETWEEN ...]
CREATE INDEX CONCURRENTLY IF NOT EXISTS survey_events_type_created_idx
  ON survey_events (event_type, created_at);

-- The single-column campaign_id and event_type indexes from migration 042 are now
-- redundant prefixes of the two above. Dropping them removes write amplification on
-- the hottest insert path in the product (every ad load writes a row here).
DROP INDEX CONCURRENTLY IF EXISTS survey_events_campaign_id_idx;
DROP INDEX CONCURRENTLY IF EXISTS survey_events_event_type_idx;

ANALYZE survey_events;
