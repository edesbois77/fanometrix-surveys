-- Migration 088: Key Findings — a new research_summaries output_type
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- A new Intelligence output sitting above Survey/Conversation Intelligence
-- in the Workspace: a flat, downloadable list of Key Findings pulled from
-- every attached source's raw data — deliberately NOT another narrative
-- report. Two kinds of finding, both plain stat sentences with no
-- interpretation:
--   "direct"   — one real percentage/count straight from the data
--                 (e.g. "72% of fans said X").
--   "combined" — 2+ genuinely related data points from the SAME question
--                 or breakdown, summed into one combined stat (e.g. three
--                 Likert options that all lean positive, added together).
-- Reuses research_summaries unchanged (source_type='research_project',
-- same as the Executive Report) — this migration only widens the
-- output_type CHECK to admit the new value. No new table, no new
-- review lifecycle: the UI for this output type is Generate/Regenerate/
-- Download only, never Approve/Publish (the row's status column exists
-- because the table is shared, not because this content is reviewed).

ALTER TABLE research_summaries DROP CONSTRAINT IF EXISTS research_summaries_output_type_check;
ALTER TABLE research_summaries ADD CONSTRAINT research_summaries_output_type_check
  CHECK (output_type IN ('research_summary', 'executive_report', 'key_findings'));

-- Rollback:
--   ALTER TABLE research_summaries DROP CONSTRAINT IF EXISTS research_summaries_output_type_check;
--   ALTER TABLE research_summaries ADD CONSTRAINT research_summaries_output_type_check
--     CHECK (output_type IN ('research_summary', 'executive_report'));
