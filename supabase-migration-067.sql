-- Migration 067: Reddit data collection
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- First real (non-CSV, non-synthetic) data source for Social Listening.
-- Adds:
--   1. Per-search Reddit config + collection status/stats on social_searches
--      (admin picks target subreddits; status surfaces on the Search detail
--      page: Not collected / Collecting / Completed / Failed).
--   2. external_id + subreddit on social_mentions, plus a partial unique
--      index so re-running a collection never inserts the same Reddit post
--      or comment twice (source_url is also unique per Reddit item, but
--      external_id — Reddit's fullname, e.g. "t3_abc123" — is the more
--      stable identity used for the actual dedup check).

ALTER TABLE social_searches
  ADD COLUMN IF NOT EXISTS reddit_subreddits text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reddit_collection_status text NOT NULL DEFAULT 'not_collected'
    CHECK (reddit_collection_status IN ('not_collected','collecting','completed','failed')),
  ADD COLUMN IF NOT EXISTS reddit_last_collected_at timestamptz,
  ADD COLUMN IF NOT EXISTS reddit_mentions_collected integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reddit_collection_error text;

ALTER TABLE social_mentions
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS subreddit text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_mentions_platform_external_id
  ON social_mentions (platform, external_id)
  WHERE external_id IS NOT NULL;

-- Rollback:
--   DROP INDEX IF EXISTS idx_social_mentions_platform_external_id;
--   ALTER TABLE social_mentions DROP COLUMN IF EXISTS external_id, DROP COLUMN IF EXISTS subreddit;
--   ALTER TABLE social_searches
--     DROP COLUMN IF EXISTS reddit_subreddits,
--     DROP COLUMN IF EXISTS reddit_collection_status,
--     DROP COLUMN IF EXISTS reddit_last_collected_at,
--     DROP COLUMN IF EXISTS reddit_mentions_collected,
--     DROP COLUMN IF EXISTS reddit_collection_error;
