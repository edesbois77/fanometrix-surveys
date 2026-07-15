-- Migration 091: Conclusion — two new research_project_activity event types
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Mirrors report_generated/report_approved (migration 070/080) for the new
-- Conclusion review workflow. Publishing a Conclusion deliberately logs as
-- the existing 'knowledge_article_created' (already in the CHECK constraint
-- since migration 070, unused until now) rather than a new
-- 'conclusion_published' value — that event type was already named for
-- exactly this moment: something landing in Knowledge.

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
      'simulation_reset', 'simulation_duplicated', 'simulation_deleted',
      'conclusion_generated', 'conclusion_approved'
    ));

-- Rollback:
--   ALTER TABLE research_project_activity DROP CONSTRAINT IF EXISTS research_project_activity_event_type_check;
--   ALTER TABLE research_project_activity
--     ADD CONSTRAINT research_project_activity_event_type_check
--       CHECK (event_type IN (
--         'project_created', 'project_updated', 'research_source_added',
--         'survey_created', 'deployments_generated',
--         'survey_status_changed', 'report_generated',
--         'report_approved', 'report_published', 'knowledge_article_created',
--         'simulated_project_created', 'simulation_evidence_generated',
--         'simulation_reset', 'simulation_duplicated', 'simulation_deleted'
--       ));
