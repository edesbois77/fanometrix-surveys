-- Migration 032: Social Listening — mentions table
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- A Mention is a single piece of collected content (post, comment, article).
-- Sentiment and topics are AI-classified and stored here.

CREATE TABLE IF NOT EXISTS sl_mentions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id     uuid        REFERENCES sl_searches(id) ON DELETE CASCADE,

  -- Source
  platform      text        NOT NULL,               -- twitter, reddit, instagram, news, etc.
  source_url    text,
  source_id     text,                               -- platform-native post ID (dedup key)
  author        text,
  content       text        NOT NULL,
  published_at  timestamptz,

  -- Geography
  country_code  text,
  market        text,

  -- AI classification
  sentiment     text        CHECK (sentiment IN ('positive','neutral','negative','mixed')),
  topics        text[]      NOT NULL DEFAULT '{}',
  relevance_score numeric(4,3),                     -- 0.000–1.000

  -- Import tracking
  import_source text        NOT NULL DEFAULT 'manual_csv',
  is_demo       boolean     NOT NULL DEFAULT false,

  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sl_mentions_dedup
  ON sl_mentions (platform, source_id)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sl_mentions_search_id
  ON sl_mentions (search_id);

CREATE INDEX IF NOT EXISTS idx_sl_mentions_published_at
  ON sl_mentions (published_at DESC)
  WHERE published_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sl_mentions_sentiment
  ON sl_mentions (sentiment)
  WHERE sentiment IS NOT NULL;

ALTER TABLE sl_mentions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon" ON sl_mentions USING (false);
