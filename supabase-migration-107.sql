-- Migration 107: Research Library — document Author + per-field "manually
-- edited" locks, extending the metadata model from migration 106.
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Adds an Author field to library_documents, populated automatically at
-- processing time (from the PDF's embedded Author metadata where present,
-- otherwise the AI's extraction from the contents) and editable by hand.
-- Once a human edits the author it must never be overwritten by AI — same
-- protection title already has (migration 106's title_manually_edited).
--
-- The description column (migration 106) is now ALSO auto-generated at
-- processing time (a concise AI summary), so it gets the same lock, and
-- author gets its own. All additive; no existing column altered.

ALTER TABLE library_documents
  ADD COLUMN IF NOT EXISTS author                       text,
  ADD COLUMN IF NOT EXISTS author_manually_edited        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS description_manually_edited   boolean NOT NULL DEFAULT false;

-- Fold author into the keyword search vector (same trigger function as
-- migrations 099/106, with author appended). Existing rows have null
-- author, so nothing to backfill; new/edited rows pick it up via the
-- existing BEFORE INSERT OR UPDATE trigger.
CREATE OR REPLACE FUNCTION set_library_documents_search_vector()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.title, '') || ' ' ||
    coalesce(NEW.author, '') || ' ' ||
    coalesce(NEW.description, '') || ' ' ||
    coalesce(NEW.source_publisher, '') || ' ' ||
    coalesce(array_to_string(NEW.tags, ' '), '') || ' ' ||
    coalesce(array_to_string(NEW.topics, ' '), '') || ' ' ||
    coalesce(array_to_string(NEW.brands_mentioned, ' '), '') || ' ' ||
    coalesce(array_to_string(NEW.markets, ' '), '') || ' ' ||
    coalesce(array_to_string(NEW.sports_competitions, ' '), '')
  );
  RETURN NEW;
END; $$;

-- Allow 'author' as an audited metadata field (migration 106 seeded the
-- audit with title/document_type/confidentiality/description only).
ALTER TABLE library_document_audit DROP CONSTRAINT IF EXISTS library_document_audit_field_check;
ALTER TABLE library_document_audit ADD CONSTRAINT library_document_audit_field_check
  CHECK (field IN ('title', 'author', 'document_type', 'confidentiality', 'description'));

-- Rollback:
--   ALTER TABLE library_document_audit DROP CONSTRAINT IF EXISTS library_document_audit_field_check;
--   ALTER TABLE library_document_audit ADD CONSTRAINT library_document_audit_field_check
--     CHECK (field IN ('title', 'document_type', 'confidentiality', 'description'));
--   ALTER TABLE library_documents DROP COLUMN IF EXISTS description_manually_edited;
--   ALTER TABLE library_documents DROP COLUMN IF EXISTS author_manually_edited;
--   ALTER TABLE library_documents DROP COLUMN IF EXISTS author;
--   -- and restore set_library_documents_search_vector() from migration 106.
