-- Migration 024: Add last_seen_at to users for session tracking
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Enables lightweight account-level activity tracking.
-- No IP, device fingerprint, location or browser data is stored.
-- The value is updated by /api/auth/ping (called from AdminShell on every
-- navigation), rate-limited server-side so the DB only writes once every
-- 5 minutes per user even if the client navigates rapidly.
--
-- "Active now" = last_seen_at >= now() - interval '10 minutes'
--
-- ROLLBACK: ALTER TABLE users DROP COLUMN IF EXISTS last_seen_at;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- Index used by the Active Sessions KPI query
CREATE INDEX IF NOT EXISTS idx_users_last_seen_at
  ON users (last_seen_at DESC)
  WHERE last_seen_at IS NOT NULL;
