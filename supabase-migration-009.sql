-- Migration 009: Campaign lifecycle management
-- Run this in the Supabase SQL Editor.

-- ============================================================
-- 1. ADD NEW COLUMNS TO campaigns
-- ============================================================
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS target_responses      integer,
  ADD COLUMN IF NOT EXISTS archive_after_days    integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS manual_status_override text,
  ADD COLUMN IF NOT EXISTS status_updated_at     timestamptz NOT NULL DEFAULT now();

-- ============================================================
-- 2. MIGRATE OLD STATUS VALUES → NEW NAMES
-- 'completed' was used before; it becomes 'closed'
-- ============================================================
UPDATE campaigns SET status = 'closed' WHERE status = 'completed';

-- ============================================================
-- 3. UPDATE STATUS CHECK CONSTRAINT
-- ============================================================
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_status_check
  CHECK (status IN ('draft', 'scheduled', 'live', 'paused', 'closed', 'archived'));

-- ============================================================
-- 4. RESPONSE COUNT VIEW (for campaign progress display)
-- Joins campaigns → responses by the text campaign_id slug.
-- Only counts non-demo responses.
-- ============================================================
CREATE OR REPLACE VIEW vw_campaign_stats AS
SELECT
  c.id            AS campaign_db_id,
  c.campaign_id,
  COALESCE(COUNT(r.id) FILTER (WHERE r.is_demo = false OR r.is_demo IS NULL), 0)
                  AS response_count
FROM campaigns c
LEFT JOIN responses r ON r.campaign_id = c.campaign_id
GROUP BY c.id, c.campaign_id;

GRANT SELECT ON vw_campaign_stats TO anon, authenticated;

-- ============================================================
-- 5. NOTIFICATIONS TABLE
-- Records automatic and manual status-change events.
-- Access: deny all anon; service role bypasses RLS.
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_notifications (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid         REFERENCES campaigns(id) ON DELETE CASCADE,
  campaign_name text         NOT NULL,
  type          text         NOT NULL,   -- 'went_live','target_reached','closed','archived','paused','resumed'
  message       text         NOT NULL,
  read_at       timestamptz,
  created_at    timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE campaign_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_anon" ON campaign_notifications USING (false);

-- Index for fast unread count queries
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON campaign_notifications (read_at) WHERE read_at IS NULL;
