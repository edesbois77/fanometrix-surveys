-- Migration 124 — Document Governance model, Phase 1 (docs/governance-model.md)
-- Run in: supabase.com → SQL Editor → New query → Run
--
-- Turns every library_document from a plain file into a GOVERNED ASSET with the
-- independent permission dimensions described in the platform architecture
-- (Chapter 8: ownership, learning and exposure are separate concepts):
--   • owner            — who owns the original source (never changes hands on upload)
--   • owner_org_id      — the owning organisation, when owner is not Fanometrix/public
--   • confidentiality   — adds 'nda_restricted' to the existing vocabulary
--   • visibility        — where the document itself may appear
--   • learning_permission — whether it may strengthen platform intelligence
--   • ai_access         — the widest AI scope that may read it
--
-- Defaults are trust-first: nothing leaks to another organisation or to the
-- platform without explicit permission. Existing rows backfill to Fanometrix-
-- internal / no-learning (their current admin-only shared-library behaviour).

ALTER TABLE library_documents
  ADD COLUMN IF NOT EXISTS owner text NOT NULL DEFAULT 'fanometrix'
    CHECK (owner IN ('fanometrix','organisation','publisher','licensed_partner','public')),
  ADD COLUMN IF NOT EXISTS owner_org_id uuid REFERENCES organisations(id),
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'internal'
    CHECK (visibility IN ('project','organisation','internal','platform')),
  ADD COLUMN IF NOT EXISTS learning_permission text NOT NULL DEFAULT 'no_learning'
    CHECK (learning_permission IN ('no_learning','anonymous','aggregated','platform')),
  ADD COLUMN IF NOT EXISTS ai_access text NOT NULL DEFAULT 'internal'
    CHECK (ai_access IN ('project','organisation','internal','platform'));

-- Widen confidentiality to add 'nda_restricted' (existing: public/internal/confidential).
ALTER TABLE library_documents DROP CONSTRAINT IF EXISTS library_documents_confidentiality_check;
ALTER TABLE library_documents ADD CONSTRAINT library_documents_confidentiality_check
  CHECK (confidentiality IN ('public','internal','confidential','nda_restricted'));

-- Index for org-scoped library queries (once the Library becomes org-facing).
CREATE INDEX IF NOT EXISTS idx_library_documents_owner_org ON library_documents (owner_org_id) WHERE owner_org_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

-- Rollback:
--   ALTER TABLE library_documents
--     DROP COLUMN IF EXISTS owner, DROP COLUMN IF EXISTS owner_org_id,
--     DROP COLUMN IF EXISTS visibility, DROP COLUMN IF EXISTS learning_permission,
--     DROP COLUMN IF EXISTS ai_access;
--   ALTER TABLE library_documents DROP CONSTRAINT IF EXISTS library_documents_confidentiality_check;
--   ALTER TABLE library_documents ADD CONSTRAINT library_documents_confidentiality_check
--     CHECK (confidentiality IN ('public','internal','confidential'));
