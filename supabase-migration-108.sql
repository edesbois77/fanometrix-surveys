-- Migration 108: Research Library — user-editable document Tags.
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- library_documents.tags (text[]) already exists (migration 099), is
-- AI-populated at processing time and already feeds the search vector.
-- This migration only adds the same "manually edited" lock the other
-- metadata fields have (migrations 106/107), so once a human curates a
-- document's tags the AI never overwrites them on re-processing, and lets
-- 'tags' be recorded in the metadata audit. All additive.

ALTER TABLE library_documents
  ADD COLUMN IF NOT EXISTS tags_manually_edited boolean NOT NULL DEFAULT false;

-- Allow 'tags' as an audited metadata field.
ALTER TABLE library_document_audit DROP CONSTRAINT IF EXISTS library_document_audit_field_check;
ALTER TABLE library_document_audit ADD CONSTRAINT library_document_audit_field_check
  CHECK (field IN ('title', 'author', 'document_type', 'confidentiality', 'description', 'tags'));

-- Rollback:
--   ALTER TABLE library_document_audit DROP CONSTRAINT IF EXISTS library_document_audit_field_check;
--   ALTER TABLE library_document_audit ADD CONSTRAINT library_document_audit_field_check
--     CHECK (field IN ('title', 'author', 'document_type', 'confidentiality', 'description'));
--   ALTER TABLE library_documents DROP COLUMN IF EXISTS tags_manually_edited;
