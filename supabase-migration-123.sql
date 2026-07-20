-- Migration 123 — document processing progress (pages_done)
-- Run in: supabase.com → SQL Editor → New query → Run
--
-- A live page-by-page progress counter for document extraction. run-extraction
-- already sets page_count once text is extracted; pages_done is incremented as
-- the visual-analysis step reads each page, so the document detail page can show
-- a real "Reading page 4 of 9" loader tied to actual progress (not an estimate).
-- Reset to NULL when (re)processing starts.

ALTER TABLE library_documents
  ADD COLUMN IF NOT EXISTS pages_done integer;

NOTIFY pgrst, 'reload schema';

-- Rollback:
--   ALTER TABLE library_documents DROP COLUMN IF EXISTS pages_done;
