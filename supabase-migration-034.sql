-- Migration 034: Social Listening — mentions and reports

CREATE TABLE IF NOT EXISTS social_mentions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id     uuid        REFERENCES social_searches(id) ON DELETE SET NULL,
  platform      text        NOT NULL,
  market        text,
  author        text,
  source_url    text,
  content       text        NOT NULL,
  language      text        NOT NULL DEFAULT 'en',
  published_at  timestamptz,

  -- AI classification (populated after import)
  sentiment     text        CHECK (sentiment IN ('Positive','Neutral','Negative','Unknown')),
  topic         text,
  subtopic      text,
  ai_summary    text,

  -- Import tracking
  import_source text        NOT NULL DEFAULT 'manual_csv',
  is_demo       boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_mentions_search_id   ON social_mentions (search_id);
CREATE INDEX IF NOT EXISTS idx_social_mentions_published   ON social_mentions (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_mentions_sentiment   ON social_mentions (sentiment);
CREATE INDEX IF NOT EXISTS idx_social_mentions_topic       ON social_mentions (topic);
CREATE INDEX IF NOT EXISTS idx_social_mentions_platform    ON social_mentions (platform);
CREATE INDEX IF NOT EXISTS idx_social_mentions_market      ON social_mentions (market);

CREATE TABLE IF NOT EXISTS social_reports (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id       uuid        REFERENCES social_searches(id) ON DELETE SET NULL,
  report_date     date        NOT NULL DEFAULT CURRENT_DATE,
  total_mentions  integer     NOT NULL DEFAULT 0,
  positive_pct    numeric(5,2),
  neutral_pct     numeric(5,2),
  negative_pct    numeric(5,2),
  top_topics      jsonb       NOT NULL DEFAULT '[]',   -- [{topic, count}]
  top_keywords    jsonb       NOT NULL DEFAULT '[]',   -- [{keyword, count}]
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_reports_search_id ON social_reports (search_id);
CREATE INDEX IF NOT EXISTS idx_social_reports_date      ON social_reports (report_date DESC);

ALTER TABLE social_mentions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_mentions" ON social_mentions USING (false);

ALTER TABLE social_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_reports" ON social_reports USING (false);
