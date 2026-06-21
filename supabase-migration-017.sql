-- Migration 017: Case-insensitive username uniqueness
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Replaces the default case-sensitive UNIQUE constraint on users.username
-- with a functional unique index on LOWER(username).
-- This means "Carlsberg_Client" and "carlsberg_client" are treated as the
-- same username and cannot both exist, while still allowing either case to
-- be stored and displayed.
--
-- All existing usernames are already lowercase so this migration is safe
-- to run without data changes.

-- 1. Drop the auto-generated case-sensitive unique constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;

-- 2. Replace with a case-insensitive functional unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_ci ON users (LOWER(username));
