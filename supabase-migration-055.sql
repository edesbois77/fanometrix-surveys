-- Migration 055: Assign work emails to existing accounts
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- ⚠️  TEMPORARY PLACEHOLDER EMAILS  ⚠️
-- The addresses below use the `.invalid` TLD, which is reserved by
-- RFC 2606 specifically so it can never resolve to a real domain — these
-- are deliberately not-real emails, not a guess at anyone's actual
-- address. Update them to real work emails later through the User
-- Management UI (once Phase 4 ships) or via a follow-up UPDATE — nothing
-- else in the app depends on these particular values being real, since
-- work_email only needs to be unique and present for login to work.
--
-- Covers every account currently in the users table (confirmed live
-- against the database, not assumed from the original migration-008 seed
-- script, whose usernames no longer match what's actually there). Every
-- account created through the app from now on supplies its own real work
-- email at creation time, so this is a one-off backfill, not an ongoing
-- pattern. If a new account is added between writing this migration and
-- running it, the guard below will catch it and name it explicitly rather
-- than failing silently.
--
-- Once every account has a work_email, this also makes it required and
-- unique (case-insensitively, mirroring the old username convention from
-- supabase-migration-017.sql) — work_email becomes the login identifier
-- from here on; the old username is kept only as legacy_username
-- (supabase-migration-054.sql), not used for login.

BEGIN;

UPDATE users SET work_email = v.email
FROM (VALUES
  ('fotmob_partner',  'fotmob-partner@fanometrix.invalid'),
  ('Carlsberg_Brand', 'carlsberg-brand@fanometrix.invalid'),
  ('Admin',           'admin@fanometrix.invalid'),
  ('Carlsberg_Agency','carlsberg-agency@fanometrix.invalid'),
  ('Planetsport',     'planetsport@fanometrix.invalid'),
  ('test',            'test@fanometrix.invalid')
) AS v(legacy_username, email)
WHERE users.legacy_username = v.legacy_username
  AND users.work_email IS NULL;

DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(legacy_username, ', ') INTO missing FROM users WHERE work_email IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'These accounts still have no work_email set, add them to the VALUES list above before running this migration: %', missing;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_work_email_ci ON users (LOWER(work_email));
ALTER TABLE users ALTER COLUMN work_email SET NOT NULL;

COMMIT;

-- Rollback:
--   ALTER TABLE users ALTER COLUMN work_email DROP NOT NULL;
--   DROP INDEX IF EXISTS idx_users_work_email_ci;
--   UPDATE users SET work_email = NULL
--     WHERE legacy_username IN ('fotmob_partner','Carlsberg_Brand','Admin','Carlsberg_Agency','Planetsport','test');
