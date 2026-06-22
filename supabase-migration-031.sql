-- Migration 031: Social Listening — searches table
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- A Search defines the listening criteria: keywords, markets, platforms.
-- Mentions are collected against a Search.

CREATE TABLE IF NOT EXISTS sl_searches (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  description  text,
  keywords     text[]      NOT NULL DEFAULT '{}',
  markets      text[]      NOT NULL DEFAULT '{}',   -- ISO country codes, e.g. {'GB','DE'}
  platforms    text[]      NOT NULL DEFAULT '{}',   -- e.g. {'twitter','reddit','instagram'}
  status       text        NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'paused', 'archived')),
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_sl_searches_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER sl_searches_updated_at
  BEFORE UPDATE ON sl_searches
  FOR EACH ROW EXECUTE FUNCTION update_sl_searches_updated_at();

ALTER TABLE sl_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon" ON sl_searches USING (false);
