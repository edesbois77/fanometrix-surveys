-- Migration 025: Access requests table
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Stores inbound access requests from the public homepage "Request Access" form.
-- Admins can review these in Supabase or a future admin page.
--
-- ROLLBACK: DROP TABLE IF EXISTS access_requests;

CREATE TABLE IF NOT EXISTS access_requests (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  email         text        NOT NULL,
  organisation  text        NOT NULL,
  role          text,                          -- e.g. "Brand", "Publisher", "Agency"
  message       text,                          -- optional free-text
  status        text        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'declined')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- RLS: deny all anon reads; service role bypasses automatically
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_read" ON access_requests FOR SELECT USING (false);

-- Index for admin reviews (newest first)
CREATE INDEX IF NOT EXISTS idx_access_requests_created_at
  ON access_requests (created_at DESC);
