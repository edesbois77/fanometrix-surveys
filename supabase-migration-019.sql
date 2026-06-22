-- Migration 019: Publishers table
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Replaces the hardcoded KNOWN_PUBLISHERS list in the UI with a proper
-- database-backed publisher registry. Admin users can add, edit and
-- delete publishers from the new /publishers admin page.

CREATE TABLE IF NOT EXISTS publishers (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at on every change
CREATE OR REPLACE FUNCTION update_publishers_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS publishers_updated_at_trigger ON publishers;
CREATE TRIGGER publishers_updated_at_trigger
  BEFORE UPDATE ON publishers
  FOR EACH ROW EXECUTE FUNCTION update_publishers_updated_at();

-- RLS: deny all anon access; service role bypasses automatically
ALTER TABLE publishers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_anon" ON publishers USING (false);

-- Seed with the publishers previously hardcoded in the UI
INSERT INTO publishers (name) VALUES
  ('FotMob'),
  ('Flashscore'),
  ('Forza Football'),
  ('LiveScore'),
  ('OneFootball'),
  ('SofaScore'),
  ('WhoScored')
ON CONFLICT (name) DO NOTHING;
