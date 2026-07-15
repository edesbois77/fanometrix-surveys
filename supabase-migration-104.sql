-- Migration 104: widen library_documents' search coverage to include
-- document_type, audience_segments, and the approved analysis's own deep
-- intelligence text (key findings, statistics, report framework,
-- recommendations, quotes).
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Root cause this fixes: the search_vector trigger (migration 099) only
-- ever concatenated title/source_publisher/tags/topics/brands_mentioned/
-- markets/sports_competitions — it never included document_type or
-- audience_segments (both already promoted columns, just excluded from
-- the formula), and it had no way to reach the richer intelligence
-- content at all, since key_findings/statistics/document_recommendations/
-- quotes/report_framework live only in library_document_analysis.content
-- (a separate table), never copied anywhere onto library_documents.
--
-- Fix: a new analysis_search_text column, populated by
-- lib/library-documents/promote-approved-metadata.ts (the SAME existing
-- "copy analysis → library_documents at approval time" mechanism that
-- already promotes markets/topics/tags/brands_mentioned/audience_segments
-- — one more field promoted the same way, not a new mechanism), holding a
-- flattened, unstructured text blob of every key finding, statistic,
-- recommendation and quote, plus the report framework's name and each
-- component's label/description. The trigger below then folds that column
-- into search_vector alongside document_type and audience_segments.

ALTER TABLE library_documents ADD COLUMN IF NOT EXISTS analysis_search_text text;

CREATE OR REPLACE FUNCTION set_library_documents_search_vector()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.title, '') || ' ' ||
    coalesce(NEW.source_publisher, '') || ' ' ||
    coalesce(NEW.document_type, '') || ' ' ||
    coalesce(array_to_string(NEW.tags, ' '), '') || ' ' ||
    coalesce(array_to_string(NEW.topics, ' '), '') || ' ' ||
    coalesce(array_to_string(NEW.brands_mentioned, ' '), '') || ' ' ||
    coalesce(array_to_string(NEW.markets, ' '), '') || ' ' ||
    coalesce(array_to_string(NEW.sports_competitions, ' '), '') || ' ' ||
    coalesce(array_to_string(NEW.audience_segments, ' '), '') || ' ' ||
    coalesce(NEW.analysis_search_text, '')
  );
  RETURN NEW;
END; $$;

-- Backfill: re-fire the trigger for every existing row so document_type
-- (a value every document already has, unlike the analysis-derived
-- columns below, which stay empty until a document is next approved)
-- starts contributing to search immediately, without waiting for a
-- re-approval. The trigger fires on any UPDATE (no column restriction),
-- so this no-op write is sufficient.
UPDATE library_documents SET updated_at = updated_at;

-- Rollback:
--   DROP TRIGGER IF EXISTS library_documents_search_vector ON library_documents;
--   DROP FUNCTION IF EXISTS set_library_documents_search_vector();
--   -- (recreate migration 099's original 7-column version if reverting fully)
--   ALTER TABLE library_documents DROP COLUMN IF EXISTS analysis_search_text;
