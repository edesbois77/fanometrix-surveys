-- Migration 033: Social Listening — searches and keywords
-- Run in: supabase.com → your project → SQL Editor → New query → Run
-- Note: If you previously ran migrations 031/032, the old sl_* tables will be dropped
--       and replaced with the new social_* schema.

DROP TABLE IF EXISTS sl_mentions CASCADE;
DROP TABLE IF EXISTS sl_searches CASCADE;

CREATE TABLE IF NOT EXISTS social_searches (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text        NOT NULL,
  description    text,
  entity_type    text        NOT NULL DEFAULT 'Brand'
                 CHECK (entity_type IN ('Brand','Club','Competition','Topic')),
  research_goal  text        NOT NULL DEFAULT 'Fan Sentiment'
                 CHECK (research_goal IN ('Fan Sentiment','Emerging Topics','Sponsorship Perception','Market Comparison','Custom')),
  markets        text[]      NOT NULL DEFAULT '{}',
  platforms      text[]      NOT NULL DEFAULT '{}',
  frequency      text        NOT NULL DEFAULT 'Manual'
                 CHECK (frequency IN ('Manual','Daily','Every 12 Hours','Every 6 Hours')),
  status         text        NOT NULL DEFAULT 'Draft'
                 CHECK (status IN ('Draft','Active','Paused','Archived')),
  created_by     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS social_keywords (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id    uuid        NOT NULL REFERENCES social_searches(id) ON DELETE CASCADE,
  keyword      text        NOT NULL,
  keyword_type text        NOT NULL DEFAULT 'Topic'
               CHECK (keyword_type IN ('Brand','Club','Player','Hashtag','Topic','Competition')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_keywords_search_id ON social_keywords (search_id);

CREATE OR REPLACE FUNCTION update_social_searches_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS social_searches_updated_at ON social_searches;
CREATE TRIGGER social_searches_updated_at
  BEFORE UPDATE ON social_searches
  FOR EACH ROW EXECUTE FUNCTION update_social_searches_updated_at();

ALTER TABLE social_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_searches" ON social_searches USING (false);

ALTER TABLE social_keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_keywords" ON social_keywords USING (false);
