-- Migration 010: Submission logs
-- Run in Supabase SQL Editor before deploying.

CREATE TABLE IF NOT EXISTS submission_logs (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         text,
  campaign_name       text,
  publisher           text,
  manual_status       text,
  effective_status    text,
  http_code           integer      NOT NULL,
  result              text         NOT NULL CHECK (result IN ('success', 'failed')),
  reason              text,
  is_test             boolean      NOT NULL DEFAULT false,
  created_at          timestamptz  NOT NULL DEFAULT now()
);

-- Only service role (server-side) can write/read — anon cannot
ALTER TABLE submission_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_anon" ON submission_logs USING (false);

-- Index for fast dashboard queries
CREATE INDEX IF NOT EXISTS idx_submission_logs_campaign ON submission_logs (campaign_id);
CREATE INDEX IF NOT EXISTS idx_submission_logs_created  ON submission_logs (created_at DESC);
