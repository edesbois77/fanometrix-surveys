-- Migration 112: Generic Conversation Intelligence engine — collection runs,
-- source-agnostic mention columns, per-run history, enriched classification.
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Foundation for a connector-based Conversation Intelligence engine (YouTube is
-- the first live connector; News/Bluesky/Google Trends/forums plug into the same
-- framework with NO schema change — source-specific fields live in metadata jsonb
-- and per-connector config in social_searches.connector_config jsonb).
--
-- Design decisions baked in here:
--  * Every collection is a timestamped snapshot (collection_runs), so runs are
--    independently reproducible and comparable over time (longitudinal analysis).
--  * Raw history is PRESERVED, never overwritten: the same external item may
--    recur across runs as separate rows, each carrying that run's metadata
--    snapshot. Dedup is therefore WITHIN a run only; cross-run dedup for display
--    is a query concern, not a storage one.
--  * Classification is enriched in place (entities/relevance/confidence added to
--    the existing sentiment/topic pipeline), not a parallel system.
-- All additive.

-- ── The timestamped snapshot / run record ───────────────────────────────────
CREATE TABLE IF NOT EXISTS collection_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id     uuid NOT NULL REFERENCES social_searches(id) ON DELETE CASCADE,
  connectors    text[] NOT NULL DEFAULT '{}',
  status        text NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running', 'completed', 'partial', 'failed')),
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  -- Per-run snapshot summary: counts per connector / content_kind, sentiment
  -- breakdown at collection time, quota used, etc. Shape is engine-defined.
  stats         jsonb NOT NULL DEFAULT '{}',
  -- Non-fatal per-item issues (comments disabled, a deleted video, one
  -- connector failing while others succeed) — surfaced without failing the run.
  warnings      jsonb NOT NULL DEFAULT '[]',
  error         text,
  triggered_by  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_collection_runs_search ON collection_runs (search_id, started_at DESC);

-- ── Source-agnostic mention columns ─────────────────────────────────────────
ALTER TABLE social_mentions
  ADD COLUMN IF NOT EXISTS connector          text,          -- 'youtube' | 'reddit' | 'news' | …
  ADD COLUMN IF NOT EXISTS content_kind       text,          -- 'video' | 'comment' | 'post' | 'article' | …
  ADD COLUMN IF NOT EXISTS metadata           jsonb NOT NULL DEFAULT '{}',  -- source-specific (channel, like_count, reply_count, view_count, subreddit…)
  ADD COLUMN IF NOT EXISTS collection_run_id  uuid REFERENCES collection_runs(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS collected_at       timestamptz,   -- snapshot time (= run.started_at)
  ADD COLUMN IF NOT EXISTS parent_external_id text,          -- generic threading: comment → its video/post
  ADD COLUMN IF NOT EXISTS entities           jsonb,         -- extracted entities (brands, clubs, people…)
  ADD COLUMN IF NOT EXISTS relevance_score    numeric(4,3),  -- 0.000–1.000, relevance to the search subject
  ADD COLUMN IF NOT EXISTS confidence         numeric(4,3);  -- 0.000–1.000, classifier confidence

-- Dedup model change: history is preserved, so the OLD global uniqueness on
-- (platform, external_id) is dropped. Uniqueness is now WITHIN a run only, which
-- keeps a single run idempotent (pagination overlap / retries) without ever
-- collapsing the same item seen in different runs.
DROP INDEX IF EXISTS idx_social_mentions_platform_external_id;
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_mentions_run_connector_external
  ON social_mentions (collection_run_id, connector, external_id)
  WHERE collection_run_id IS NOT NULL AND external_id IS NOT NULL;
-- Fast "latest per item across runs" + provenance lookups.
CREATE INDEX IF NOT EXISTS idx_social_mentions_connector_external
  ON social_mentions (connector, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_social_mentions_run ON social_mentions (collection_run_id);

-- ── Source-agnostic search config ───────────────────────────────────────────
ALTER TABLE social_searches
  -- Per-connector settings, keyed by connector id, e.g.
  -- {"reddit": {"subreddits": ["soccer"]}, "youtube": {"max_videos": 25, "comments_per_video": 100}}
  ADD COLUMN IF NOT EXISTS connector_config jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS collect_from     date,
  ADD COLUMN IF NOT EXISTS collect_to       date,
  ADD COLUMN IF NOT EXISTS languages        text[] NOT NULL DEFAULT '{}';

-- Rollback:
--   DROP INDEX IF EXISTS idx_social_mentions_run;
--   DROP INDEX IF EXISTS idx_social_mentions_connector_external;
--   DROP INDEX IF EXISTS uq_social_mentions_run_connector_external;
--   ALTER TABLE social_searches DROP COLUMN IF EXISTS connector_config, DROP COLUMN IF EXISTS collect_from, DROP COLUMN IF EXISTS collect_to, DROP COLUMN IF EXISTS languages;
--   ALTER TABLE social_mentions DROP COLUMN IF EXISTS connector, DROP COLUMN IF EXISTS content_kind, DROP COLUMN IF EXISTS metadata, DROP COLUMN IF EXISTS collection_run_id, DROP COLUMN IF EXISTS collected_at, DROP COLUMN IF EXISTS parent_external_id, DROP COLUMN IF EXISTS entities, DROP COLUMN IF EXISTS relevance_score, DROP COLUMN IF EXISTS confidence;
--   DROP TABLE IF EXISTS collection_runs;
--   (and re-create idx_social_mentions_platform_external_id from migration 067 if reverting)
