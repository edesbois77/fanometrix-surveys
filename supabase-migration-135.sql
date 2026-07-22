-- Migration 135: survey_events composite indexes for the dashboard funnel counts
--
-- survey_events has passed 1.1M rows (785k of them SURVEY_RENDER, growing ~15k/hour
-- once campaigns are live). Migration 042 gave it only single-column indexes, so the
-- dashboard's funnel queries -- which always filter campaign_id AND event_type
-- together -- have to bitmap two large index scans and then recheck every candidate
-- row on the heap. At current volume that exceeds the statement timeout: counting
-- SURVEY_RENDER for a single busy campaign takes 7-9s and is cancelled (57014).
--
-- The API used to coerce a cancelled count to 0 (`count ?? 0`), so Survey
-- Intelligence rendered "Impressions (Loads) 0" while Q1 Answered / Completed --
-- whose counts are small enough to return -- showed real numbers. The API now
-- returns null for a failed count and the UI shows "-", but the counts still need
-- to actually work: that is what these composites are for. They let the same
-- queries run as index-only scans over exactly the matching entries.
--
-- ============================================================================
-- HOW TO RUN THIS -- read before pasting anywhere
-- ============================================================================
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block, and the
-- Supabase SQL editor wraps everything it runs in one. Pasting section A into the
-- SQL editor fails with "ERROR: 25001: CREATE INDEX CONCURRENTLY cannot run inside
-- a transaction block". Pick ONE of the two sections below.
--
--   Section A (preferred) -- CONCURRENTLY, via psql. Does not block writes at all.
--     Get the connection string from the Supabase dashboard:
--       Project Settings > Database > Connection string > URI  (direct, not pooled --
--       the transaction pooler does not support CONCURRENTLY either)
--     Then:
--       psql "$DATABASE_URL" -f supabase-migration-135.sql
--     psql sends each statement separately in autocommit, so CONCURRENTLY is fine.
--     Build time on this table is roughly 10-30s per index; writes continue
--     throughout.
--
--   Section B (fallback) -- plain CREATE INDEX, works in the Supabase SQL editor.
--     Takes an ACCESS EXCLUSIVE lock on survey_events for the duration of each
--     build (~10-30s each). Event INSERTs from live embeds BLOCK for that window.
--     At ~4 renders/second that queues roughly 80-120 inserts per index; they
--     complete when the lock releases, but any that hit their own timeout first are
--     lost, and lost impression events cannot be recovered. Prefer a low-traffic
--     window if you go this route.
--
-- Run section A OR section B, never both. Then run section C either way.
-- ============================================================================


-- ============================================================================
-- SECTION A -- via psql (preferred, non-blocking)
-- ============================================================================

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
-- Drop them only AFTER confirming the new indexes exist and are being used.
DROP INDEX CONCURRENTLY IF EXISTS survey_events_campaign_id_idx;
DROP INDEX CONCURRENTLY IF EXISTS survey_events_event_type_idx;


-- ============================================================================
-- SECTION B -- via the Supabase SQL editor (blocks writes while each runs)
-- Uncomment this block and comment out section A if you cannot use psql.
-- Run each statement on its own, and check the dashboard between them.
-- ============================================================================

-- CREATE INDEX IF NOT EXISTS survey_events_campaign_type_created_idx
--   ON survey_events (campaign_id, event_type, created_at);
--
-- CREATE INDEX IF NOT EXISTS survey_events_type_created_idx
--   ON survey_events (event_type, created_at);
--
-- DROP INDEX IF EXISTS survey_events_campaign_id_idx;
-- DROP INDEX IF EXISTS survey_events_event_type_idx;


-- ============================================================================
-- SECTION C -- run either way, safe in the SQL editor
-- ============================================================================

ANALYZE survey_events;
