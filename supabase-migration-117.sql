-- Migration 117: Aspect Synthesis — a new research_summaries output_type
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- The first synthesis layer of Analysis. Structured evidence (conversations
-- today; surveys and documents later) is grouped by its AI-assigned
-- research_aspect (Brand Perception, Fan Benefits, Brand Fit, …) and each aspect
-- is synthesised into { summary, key_findings, recommended_actions }. Every key
-- finding stores the ids of the evidence that supports it, so a researcher can
-- expand a finding and see the exact conversations behind it — the
-- Evidence → Aspect → Finding chain, before the project-level Key Findings roll-up.
--
-- Reuses research_summaries unchanged (source_type='research_project', same as
-- Key Findings / Executive Report): this migration only widens the output_type
-- CHECK to admit the new value. The finding→evidence links live inside the
-- content jsonb — no schema change for them. No review lifecycle beyond
-- Draft/regenerate today (mirrors key_findings), so no activity CHECK change.

ALTER TABLE research_summaries DROP CONSTRAINT IF EXISTS research_summaries_output_type_check;
ALTER TABLE research_summaries ADD CONSTRAINT research_summaries_output_type_check
  CHECK (output_type IN ('research_summary', 'executive_report', 'key_findings', 'conclusion', 'editorial_article', 'full_research_report', 'aspect_synthesis'));

-- Rollback:
--   ALTER TABLE research_summaries DROP CONSTRAINT IF EXISTS research_summaries_output_type_check;
--   ALTER TABLE research_summaries ADD CONSTRAINT research_summaries_output_type_check
--     CHECK (output_type IN ('research_summary', 'executive_report', 'key_findings', 'conclusion', 'editorial_article', 'full_research_report'));
