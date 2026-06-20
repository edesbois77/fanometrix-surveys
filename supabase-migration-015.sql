-- Migration 015: Campaign soft delete + status history
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Adds:
--   deleted_at, deleted_by, delete_reason  — soft delete support on campaigns
--   campaign_status_history                — audit trail for status transitions

-- ── 1. Soft delete columns on campaigns ───────────────────────────────────────
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS deleted_at    timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by    text,
  ADD COLUMN IF NOT EXISTS delete_reason text;

-- ── 2. Status history table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_status_history (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid        REFERENCES campaigns(id) ON DELETE CASCADE,
  old_status   text,
  new_status   text        NOT NULL,
  reason       text,
  changed_by   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE campaign_status_history ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically; deny all others
CREATE POLICY "deny_all_anon" ON campaign_status_history USING (false);

CREATE INDEX IF NOT EXISTS idx_status_history_campaign
  ON campaign_status_history (campaign_id, created_at DESC);
