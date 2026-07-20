-- Migration 122 — Research Plan (docs/research-plan-blueprint.md, Phase 1)
-- Run in: supabase.com → SQL Editor → New query → Run
--
-- Adds a 'research_plan' output_type to research_summaries so the Research Plan
-- (the project's methodology briefing) is stored, reviewed, edited and approved
-- through the SAME draft→edited→approved lifecycle every other AI artifact uses
-- (store.ts). source_type is 'research_project', source_id is the project id —
-- one plan per project. No new table; just a CHECK-widen, same as migration 117.

ALTER TABLE research_summaries DROP CONSTRAINT IF EXISTS research_summaries_output_type_check;
ALTER TABLE research_summaries ADD CONSTRAINT research_summaries_output_type_check
  CHECK (output_type IN ('research_summary', 'executive_report', 'key_findings', 'conclusion', 'editorial_article', 'full_research_report', 'aspect_synthesis', 'research_plan'));

NOTIFY pgrst, 'reload schema';

-- Rollback (only if no research_plan rows exist):
--   ALTER TABLE research_summaries DROP CONSTRAINT IF EXISTS research_summaries_output_type_check;
--   ALTER TABLE research_summaries ADD CONSTRAINT research_summaries_output_type_check
--     CHECK (output_type IN ('research_summary','executive_report','key_findings','conclusion','editorial_article','full_research_report','aspect_synthesis'));
