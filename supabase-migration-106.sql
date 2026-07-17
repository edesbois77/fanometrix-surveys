-- Migration 106: Research Library — editable document metadata, an
-- append-only change audit, and a guard so the AI never overwrites a
-- human-edited title.
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Background. A library_document is a single, GLOBAL record shared across
-- every Research Project that attaches it (migration 099). We are now
-- letting admins AND publishers (the internal research curators — the
-- "project owner / manager" role in product terms) edit a document's
-- display title, type, confidentiality and a new free-text description.
-- Because the record is shared, edits apply everywhere; the app surfaces
-- that explicitly and confirms confidentiality changes. This migration
-- adds only what that needs — all additive, no existing column altered.
--
-- Three things:
--   1. library_documents.description — an optional human summary / notes
--      field (what the document contains, why it was added). Folded into
--      the search vector below so it's findable.
--   2. library_documents.title_manually_edited — once a human edits the
--      title, the AI-analysis approval step must never clobber it (see
--      promote-approved-metadata.ts, which already refuses to auto-apply
--      document_type for the same reason). This flag makes the title just
--      as sticky. Default false; set true by the PATCH endpoint whenever a
--      human changes the title.
--   3. library_document_audit — an append-only log of metadata changes
--      (which field, old → new, who, when, and which project the edit was
--      made from). Document-scoped, not project-scoped, so the full history
--      of a shared asset lives in one place regardless of where it was
--      edited from. Mirrors research_project_activity's shape (migration
--      070).

-- ── 1 & 2. New columns on library_documents ──────────────────────────────
ALTER TABLE library_documents
  ADD COLUMN IF NOT EXISTS description            text,
  ADD COLUMN IF NOT EXISTS title_manually_edited  boolean NOT NULL DEFAULT false;

-- ── 3. Append-only metadata audit ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS library_document_audit (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  library_document_id  uuid        NOT NULL REFERENCES library_documents(id) ON DELETE CASCADE,

  -- Only the human-editable metadata fields are audited here.
  field                text        NOT NULL CHECK (field IN (
                          'title', 'document_type', 'confidentiality', 'description'
                        )),
  old_value            text,
  new_value            text,
  changed_by           text,

  -- Provenance only: which project the edit was made from, if any. The
  -- edit itself is global. ON DELETE SET NULL so deleting a project never
  -- erases a document's audit history.
  project_context      uuid        REFERENCES research_projects(id) ON DELETE SET NULL,

  changed_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_library_document_audit_doc
  ON library_document_audit (library_document_id, changed_at DESC);

ALTER TABLE library_document_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_library_document_audit" ON library_document_audit USING (false);

-- ── 4. Fold description into the existing search vector ───────────────────
-- Same trigger function as migration 099, with description appended. A
-- CREATE OR REPLACE + a no-op UPDATE would be needed to backfill existing
-- rows' vectors, but description is null for all existing rows, so there is
-- nothing to backfill — new/edited rows pick it up via the existing
-- BEFORE INSERT OR UPDATE trigger.
CREATE OR REPLACE FUNCTION set_library_documents_search_vector()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.title, '') || ' ' ||
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

-- Rollback:
--   DROP TABLE IF EXISTS library_document_audit;
--   ALTER TABLE library_documents DROP COLUMN IF EXISTS title_manually_edited;
--   ALTER TABLE library_documents DROP COLUMN IF EXISTS description;
--   -- and restore set_library_documents_search_vector() without the
--   -- description line from migration 099 if desired.
