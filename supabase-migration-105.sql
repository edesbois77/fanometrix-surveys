-- Migration 105: Full Research Report — a new research_summaries output_type
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- The comprehensive analytical expansion of an approved Executive Report:
-- one deep-dive section per Strategic Theme (drawing on the complete
-- validated Key Findings pool, not only the findings the Executive Report
-- itself selected), plus a fuller Executive Summary, plus the full
-- evidence appendix. Sits after the Executive Report in the Reports
-- product hierarchy, before any derivative output (Editorial Article,
-- Conclusion) — neither of those change or read this new type.
--
-- Reuses research_summaries unchanged (source_type='research_project',
-- same as Executive Report/Key Findings/Conclusion/Editorial Article) —
-- this migration only widens the output_type CHECK to admit the new
-- value, and widens research_project_activity's event_type CHECK for the
-- two new activity events this workflow logs (mirrors migration 098's
-- Editorial Article pattern: generate/approve are logged, publish is not,
-- since there is no downstream consumer of the published state yet).
-- Full Research Report DOES go through the full Draft → Edited →
-- Approved → Published review lifecycle already built into this table,
-- same as Executive Report/Conclusion/Editorial Article.

ALTER TABLE research_summaries DROP CONSTRAINT IF EXISTS research_summaries_output_type_check;
ALTER TABLE research_summaries ADD CONSTRAINT research_summaries_output_type_check
  CHECK (output_type IN ('research_summary', 'executive_report', 'key_findings', 'conclusion', 'editorial_article', 'full_research_report'));

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
      'article_generated', 'article_approved',
      'full_research_report_generated', 'full_research_report_approved'
    ));

-- Rollback:
--   ALTER TABLE research_summaries DROP CONSTRAINT IF EXISTS research_summaries_output_type_check;
--   ALTER TABLE research_summaries ADD CONSTRAINT research_summaries_output_type_check
--     CHECK (output_type IN ('research_summary', 'executive_report', 'key_findings', 'conclusion', 'editorial_article'));
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
--         'conclusion_generated', 'conclusion_approved',
--         'article_generated', 'article_approved'
--       ));
