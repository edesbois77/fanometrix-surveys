-- Migration 102: research_summaries.source_type — widen to admit 'document_project'
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Project-specific Document Intelligence — the AI's interpretation of an
-- attached Library Document through the lens of ONE project's Research
-- Question — reuses research_summaries exactly like Survey Intelligence
-- and Conversation Intelligence do (output_type stays the default
-- 'research_summary', no new output_type value needed; source_type is what
-- distinguishes it, same as it already distinguishes 'survey' from
-- 'conversation_search').
--
-- source_id for this source_type is deliberately the research_project_evidence
-- row's own id, NOT library_documents.id — the same document attached to
-- two different projects gets two independent 'document_project' summaries,
-- one per (project, document) attachment, because the same document can
-- legitimately mean something different against two different Research
-- Questions. Using the evidence row's id costs nothing extra: it's already
-- unique per (project, evidence_type, evidence_id) via migration 069's own
-- index, so no schema change to research_summaries' own unique key
-- (source_type, source_id, output_type) is needed for this to work
-- correctly.
--
-- The document's global analysis (library_document_analysis, migration 101)
-- is explicitly NOT stored here — see that migration's header comment for
-- why the two are kept apart.

ALTER TABLE research_summaries DROP CONSTRAINT IF EXISTS research_summaries_source_type_check;
ALTER TABLE research_summaries ADD CONSTRAINT research_summaries_source_type_check
  CHECK (source_type IN ('conversation_search', 'survey', 'research_project', 'document_project'));

-- Rollback:
--   ALTER TABLE research_summaries DROP CONSTRAINT IF EXISTS research_summaries_source_type_check;
--   ALTER TABLE research_summaries ADD CONSTRAINT research_summaries_source_type_check
--     CHECK (source_type IN ('conversation_search', 'survey', 'research_project'));
