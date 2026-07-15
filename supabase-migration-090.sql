-- Migration 090: Conclusion — a new research_summaries output_type
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Phase 1 of the Research Workspace restructure (Research Question →
-- Dashboard → Research Sources → Intelligence → Report → Conclusion →
-- Knowledge). Conclusion distils the project's approved Executive Report
-- into one clear, evidence-backed answer to the original research_question
-- — deliberately not another AI summary of the evidence (the Executive
-- Report already is that). Once published, it's what Knowledge surfaces.
--
-- Reuses research_summaries unchanged (source_type='research_project',
-- same as the Executive Report and Key Findings) — this migration only
-- widens the output_type CHECK to admit the new value. Unlike Key
-- Findings, Conclusion DOES go through the full Draft → Approved →
-- Published review lifecycle already built into this table (status,
-- reviewed_by/at, published_at) — publishing is what hands it to
-- Knowledge, so it needs the same gate Survey/Conversation Intelligence
-- and the Executive Report already use.

ALTER TABLE research_summaries DROP CONSTRAINT IF EXISTS research_summaries_output_type_check;
ALTER TABLE research_summaries ADD CONSTRAINT research_summaries_output_type_check
  CHECK (output_type IN ('research_summary', 'executive_report', 'key_findings', 'conclusion'));

-- Rollback:
--   ALTER TABLE research_summaries DROP CONSTRAINT IF EXISTS research_summaries_output_type_check;
--   ALTER TABLE research_summaries ADD CONSTRAINT research_summaries_output_type_check
--     CHECK (output_type IN ('research_summary', 'executive_report', 'key_findings'));
