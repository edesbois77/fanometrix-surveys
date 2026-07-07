-- Migration 058: Make users.username nullable
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- User Management v2 (app/api/users/route.ts) no longer supplies a
-- username on create — work_email is the login identifier now, and the
-- old username is preserved only as legacy_username for existing accounts
-- (supabase-migration-054.sql). But the original NOT NULL constraint from
-- supabase-migration-008.sql was never relaxed, so every new account
-- created through the v2 UI would fail with "null value in column
-- username violates not-null constraint" until this runs.
--
-- The case-insensitive unique index on username (supabase-migration-017.sql)
-- is left in place and still works correctly with a nullable column —
-- Postgres treats each NULL as distinct for uniqueness purposes, so
-- multiple accounts with no username can coexist.

ALTER TABLE users ALTER COLUMN username DROP NOT NULL;

-- Rollback:
--   ALTER TABLE users ALTER COLUMN username SET NOT NULL;
--   (only safe if no row has username IS NULL)
