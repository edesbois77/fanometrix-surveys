-- Migration 056: Create user_access_grants table
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- The "Assign Access" backbone for User Management v2 (Selected Access).
-- Deliberately polymorphic (resource_type + resource_id, not one join
-- table per resource) so the same permission system can cover Research
-- Projects, Campaign Groups, Campaigns, and Insights today, and
-- Dashboards/Exports/Conversation Intelligence later, without new tables.
-- No permission-template concept (e.g. "Publisher Admin") — a user's
-- effective access is always the direct combination of their role, access
-- scope, and these grant rows.
--
-- Note: 'report' isn't a separate resource_type — supabase-migration-038.sql
-- shows Reports are just Insights with content_type = 'report' (both live
-- in the single `insights` table), so a grant on resource_type='insight'
-- covers both; the UI can still label a grant "Report" vs "Insight" based
-- on the underlying row's content_type when presenting it to an admin.
--
-- No native foreign key on resource_id — Postgres can't constrain a
-- single column against multiple target tables. Referential integrity
-- here is an application-layer responsibility (lib/access.ts): when a
-- resource is hard-deleted, its matching grant rows should be deleted
-- too. In practice almost everything in this schema soft-deletes, so this
-- is a rare edge case, not a routine one.

CREATE TABLE IF NOT EXISTS user_access_grants (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_type text        NOT NULL CHECK (resource_type IN (
                              'research_project', 'campaign_group', 'campaign', 'insight'
                            )),
  resource_id   uuid        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    text
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grants_unique
  ON user_access_grants (user_id, resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_grants_user     ON user_access_grants (user_id);
CREATE INDEX IF NOT EXISTS idx_grants_resource ON user_access_grants (resource_type, resource_id);

ALTER TABLE user_access_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_anon" ON user_access_grants USING (false);

-- Rollback:
--   DROP TABLE IF EXISTS user_access_grants;
