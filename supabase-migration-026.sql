-- Migration 026: Add soft-delete columns to campaigns
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- The campaigns page uses soft delete (deleted_at / deleted_by / delete_reason)
-- to allow recovery from the Deleted tab. These columns are referenced in the
-- code but were missing from the database schema.
--
-- ROLLBACK:
-- ALTER TABLE campaigns
--   DROP COLUMN IF EXISTS deleted_at,
--   DROP COLUMN IF EXISTS deleted_by,
--   DROP COLUMN IF EXISTS delete_reason;

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS deleted_at     timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by     text,
  ADD COLUMN IF NOT EXISTS delete_reason  text;
