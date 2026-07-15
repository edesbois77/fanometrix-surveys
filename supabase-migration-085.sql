-- Migration 085: Simulation — can_present_simulations capability, durable deletion log
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Phase 6 of the Demo Projects blueprint. Two small, unrelated additions
-- both needed before the creation/management API can be built:
--
-- 1. users.can_present_simulations — the one new capability from the
--    blueprint's permissions design (§06): a grant on an existing
--    account, not a new role. Admins always have it implicitly (checked
--    in application code, not duplicated here as a second source of
--    truth); this flag is what lets a non-admin (Sales/CS/Onboarding)
--    launch, present, reset, duplicate and delete their own Demo
--    Projects.
--
-- 2. simulation_deletion_log — the durable audit record the blueprint's
--    Reset/Deletion design (§07/§14) requires: deleting a simulated
--    project cascades through research_project_activity along with it
--    (ON DELETE CASCADE, migration 070), which would destroy the one
--    log entry that matters most — "this was deleted, by whom, how
--    much it contained" — at exactly the moment it's needed. This table
--    deliberately has NO foreign key to research_projects, so it
--    survives the project it's logging the deletion of. Written once,
--    immediately before the cascade executes.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS can_present_simulations boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS simulation_deletion_log (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  research_project_id  uuid        NOT NULL,  -- intentionally no FK — must outlive the deleted row
  project_name         text        NOT NULL,
  research_mode        text        NOT NULL,
  actor                text,
  row_counts           jsonb       NOT NULL DEFAULT '{}',
  deleted_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE simulation_deletion_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_simulation_deletion_log" ON simulation_deletion_log USING (false);

-- Rollback:
--   DROP TABLE IF EXISTS simulation_deletion_log;
--   ALTER TABLE users DROP COLUMN IF EXISTS can_present_simulations;
