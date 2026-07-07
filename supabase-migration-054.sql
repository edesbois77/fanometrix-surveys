-- Migration 054: Add User Management v2 columns to users
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Part of the Organisations/Permissions redesign (supabase-migration-052
-- through -057). Adds the enterprise user fields — first/last name, work
-- email (becomes the login identifier once every account has one, see
-- supabase-migration-055.sql), job title, organisation_id, access scope,
-- and the 3-state status lifecycle — and backfills what can be safely
-- derived from existing data. The old username/organisation_name/
-- is_active/allowed_*/associated_* columns are left in place for now so
-- the app keeps working unchanged; they're dropped in a later cleanup
-- migration once all application code has moved to the new columns.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS first_name          text,
  ADD COLUMN IF NOT EXISTS last_name           text,
  ADD COLUMN IF NOT EXISTS work_email          text,
  ADD COLUMN IF NOT EXISTS job_title           text,
  ADD COLUMN IF NOT EXISTS organisation_id     uuid REFERENCES organisations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS access_scope        text NOT NULL DEFAULT 'organisation_wide'
                          CHECK (access_scope IN ('organisation_wide', 'selected')),
  ADD COLUMN IF NOT EXISTS status              text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('pending_invitation', 'active', 'disabled')),
  ADD COLUMN IF NOT EXISTS last_login_at       timestamptz,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by          text,
  ADD COLUMN IF NOT EXISTS legacy_username     text;

-- Preserve the old username purely as a reference — work_email takes over
-- as the login identifier once populated (supabase-migration-055.sql).
UPDATE users SET legacy_username = username WHERE legacy_username IS NULL;

-- Carry forward the existing active/disabled state. There is no
-- historical "pending invitation" concept, so nothing maps to that status
-- here — it only applies to new accounts created going forward.
UPDATE users SET status = CASE WHEN is_active THEN 'active' ELSE 'disabled' END;

-- Match each user's free-text organisation_name to the organisation
-- seeded with the same name in supabase-migration-053.sql.
UPDATE users u
SET organisation_id = o.id
FROM organisations o
WHERE u.organisation_id IS NULL
  AND u.organisation_name IS NOT NULL
  AND trim(u.organisation_name) <> ''
  AND LOWER(o.name) = LOWER(u.organisation_name)
  AND o.deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_organisation_id ON users (organisation_id);

-- Rollback:
--   ALTER TABLE users
--     DROP COLUMN IF EXISTS first_name, DROP COLUMN IF EXISTS last_name,
--     DROP COLUMN IF EXISTS work_email, DROP COLUMN IF EXISTS job_title,
--     DROP COLUMN IF EXISTS organisation_id, DROP COLUMN IF EXISTS access_scope,
--     DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS last_login_at,
--     DROP COLUMN IF EXISTS password_changed_at, DROP COLUMN IF EXISTS created_by,
--     DROP COLUMN IF EXISTS legacy_username;
