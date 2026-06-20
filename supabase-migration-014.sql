-- Migration 014: User account improvements
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Adds:
--   force_password_change — admin can require a user to set a new password on first login
--   updated_at           — tracks when the account was last modified

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS force_password_change boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at            timestamptz NOT NULL DEFAULT now();

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_updated_at_trigger ON users;
CREATE TRIGGER users_updated_at_trigger
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_users_updated_at();
