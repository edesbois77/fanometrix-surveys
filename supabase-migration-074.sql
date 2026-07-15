-- Migration 074: Executive Report — Phase 4 (Research Reports)
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Widens research_summaries (migration 068/069) to also hold the
-- project-level Executive Report, reusing the same table/workflow as
-- Survey/Conversation Intelligence rather than a new table — migration
-- 068's own header comment already anticipated exactly this: "one generic
-- table rather than separate ai_outputs/insight_cards/research_summaries
-- tables — source_type/output_type carry the polymorphism... without a
-- schema rewrite." Reports are a family of output types (Executive Report
-- today, Benchmark/Client/Deck report types later), same as
-- conversation_search/survey are a family of source types today.
--
-- source_type='research_project' + output_type='executive_report' +
-- source_id=research_projects.id — everything else on the row (content/
-- edited_content/status/model/generated_at/generated_by/reviewed_by/
-- reviewed_at/published_at/confidence/consensus/coverage) is reused as-is.

ALTER TABLE research_summaries DROP CONSTRAINT IF EXISTS research_summaries_source_type_check;
ALTER TABLE research_summaries ADD CONSTRAINT research_summaries_source_type_check
  CHECK (source_type IN ('conversation_search', 'survey', 'research_project'));

ALTER TABLE research_summaries DROP CONSTRAINT IF EXISTS research_summaries_output_type_check;
ALTER TABLE research_summaries ADD CONSTRAINT research_summaries_output_type_check
  CHECK (output_type IN ('research_summary', 'executive_report'));

-- Rollback:
--   ALTER TABLE research_summaries DROP CONSTRAINT IF EXISTS research_summaries_output_type_check;
--   ALTER TABLE research_summaries ADD CONSTRAINT research_summaries_output_type_check
--     CHECK (output_type IN ('research_summary'));
--   ALTER TABLE research_summaries DROP CONSTRAINT IF EXISTS research_summaries_source_type_check;
--   ALTER TABLE research_summaries ADD CONSTRAINT research_summaries_source_type_check
--     CHECK (source_type IN ('conversation_search', 'survey'));
