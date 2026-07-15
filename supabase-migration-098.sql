-- Migration 098: Editorial Article — a new research_summaries output_type
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- The first data-journalism-style output for a Research Project: a
-- public-facing story built from the strongest findings in the approved
-- Executive Report, plus exact statistics/charts sourced from each
-- included source's own frozen structured_evidence (see
-- lib/intelligence/structured-evidence.ts, and the additive
-- structured_evidence field now returned by analyseSurvey.ts/
-- analyseConversation.ts — no schema change needed for that, it's stored
-- inside each report's existing JSONB content column).
--
-- Reuses research_summaries unchanged (source_type='research_project',
-- same as Executive Report/Key Findings/Conclusion) — this migration only
-- widens the output_type CHECK to admit the new value, and widens
-- research_project_activity's event_type CHECK for the two new activity
-- events this workflow logs (mirrors migration 091's Conclusion pattern).
-- Editorial Article DOES go through the full Draft → Edited → Approved →
-- Published review lifecycle already built into this table, same as the
-- Executive Report and Conclusion — Publish is what marks it ready to
-- share; public/unauthenticated distribution itself is a later phase, not
-- part of this migration.

ALTER TABLE research_summaries DROP CONSTRAINT IF EXISTS research_summaries_output_type_check;
ALTER TABLE research_summaries ADD CONSTRAINT research_summaries_output_type_check
  CHECK (output_type IN ('research_summary', 'executive_report', 'key_findings', 'conclusion', 'editorial_article'));

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
      'conclusion_generated', 'conclusion_approved',
      'article_generated', 'article_approved'
    ));

-- Rollback:
--   ALTER TABLE research_summaries DROP CONSTRAINT IF EXISTS research_summaries_output_type_check;
--   ALTER TABLE research_summaries ADD CONSTRAINT research_summaries_output_type_check
--     CHECK (output_type IN ('research_summary', 'executive_report', 'key_findings', 'conclusion'));
--
--   ALTER TABLE research_project_activity DROP CONSTRAINT IF EXISTS research_project_activity_event_type_check;
--   ALTER TABLE research_project_activity
--     ADD CONSTRAINT research_project_activity_event_type_check
--       CHECK (event_type IN (
--         'project_created', 'project_updated', 'research_source_added',
--         'survey_created', 'deployments_generated',
--         'survey_status_changed', 'report_generated',
--         'report_approved', 'report_published', 'knowledge_article_created',
--         'simulated_project_created', 'simulation_evidence_generated',
--         'simulation_reset', 'simulation_duplicated', 'simulation_deleted',
--         'conclusion_generated', 'conclusion_approved'
--       ));
