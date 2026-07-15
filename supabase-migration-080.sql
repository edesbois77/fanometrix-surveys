-- Migration 080: Simulation — is_simulated on research_project_activity + event_type widening
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Phase 2 (5 of 6) of the Demo Projects blueprint. Every activity row
-- gets its own provenance flag (so the Workspace's Activity feed can
-- badge simulation-related lines distinctly), plus a bare
-- evidence_simulation_id uuid (FK added in Phase 5, migration 081,
-- once evidence_simulations exists — same deferred-FK pattern as
-- migration 079).
--
-- event_type's CHECK constraint is widened to admit five new values
-- for Simulation-related activity. Named to match the rest of the
-- schema's vocabulary — deliberately not prefixed 'demo_', so the
-- product-facing "Demo Projects" label (V1's UI surface for the
-- underlying Simulation capability) can change later without touching
-- the database. Postgres auto-named the original inline CHECK
-- <table>_<column>_check; this drops that exact name defensively
-- before re-adding the widened constraint under the same name.

ALTER TABLE research_project_activity
  ADD COLUMN IF NOT EXISTS is_simulated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS evidence_simulation_id uuid;

ALTER TABLE research_project_activity
  DROP CONSTRAINT IF EXISTS research_project_activity_event_type_check;

ALTER TABLE research_project_activity
  ADD CONSTRAINT research_project_activity_event_type_check
    CHECK (event_type IN (
      'project_created', 'project_updated', 'research_source_added',
      'survey_created', 'deployments_generated',
      'survey_status_changed', 'report_generated',
      'report_approved', 'report_published', 'knowledge_article_created',
      'simulated_project_created', 'simulation_evidence_generated',
      'simulation_reset', 'simulation_duplicated', 'simulation_deleted'
    ));

-- Rollback:
--   ALTER TABLE research_project_activity DROP CONSTRAINT IF EXISTS research_project_activity_event_type_check;
--   ALTER TABLE research_project_activity
--     ADD CONSTRAINT research_project_activity_event_type_check
--       CHECK (event_type IN (
--         'project_created', 'project_updated', 'research_source_added',
--         'survey_created', 'deployments_generated',
--         'survey_status_changed', 'report_generated',
--         'report_approved', 'report_published', 'knowledge_article_created'
--       ));
--   ALTER TABLE research_project_activity DROP COLUMN IF EXISTS is_simulated,
--     DROP COLUMN IF EXISTS evidence_simulation_id;
