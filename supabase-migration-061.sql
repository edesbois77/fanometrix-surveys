-- Migration 061: Drop the publishers table
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Cutover for the User Management v2 / Organisations redesign. The
-- publishers table (supabase-migration-019.sql) was a bare id+name
-- registry used only to populate autocomplete pickers — organisations
-- (supabase-migration-052.sql) fully supersedes it, already seeded from
-- every row here (supabase-migration-053.sql). app/publishers and
-- app/api/publishers have been removed from the app; nothing reads this
-- table anymore (verified via a full codebase grep).
--
-- Must run AFTER migration 060, which repoints creative_designs.publisher_id
-- (the last remaining FK into this table) to organisations and drops it —
-- this DROP TABLE would otherwise fail on that dependency.

DROP TABLE IF EXISTS publishers;
DROP FUNCTION IF EXISTS update_publishers_updated_at();

-- Rollback (recreates the empty table — data is not recoverable once this
-- migration runs; re-seed from organisations if needed):
--   CREATE TABLE publishers (
--     id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
--     name       text        NOT NULL UNIQUE,
--     created_at timestamptz NOT NULL DEFAULT now(),
--     updated_at timestamptz NOT NULL DEFAULT now()
--   );
--   ALTER TABLE publishers ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY "deny_all_anon" ON publishers USING (false);
