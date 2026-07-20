-- Migration 125 — "Project Only" visibility means bound to a single engagement
-- Run in: supabase.com → SQL Editor → New query → Run
--
-- Makes the least-privilege visibility level real (docs/governance-model.md). A
-- document with visibility = 'project' is bound to ONE research project via
-- scope_project_id and can only ever be attached there — not to every project of
-- the owning organisation. Promote to 'organisation' visibility to reuse it across
-- the org's projects. NULL scope_project_id + 'project' visibility falls back to
-- organisation scoping (e.g. set outside a project context).

ALTER TABLE library_documents
  ADD COLUMN IF NOT EXISTS scope_project_id uuid REFERENCES research_projects(id);

CREATE INDEX IF NOT EXISTS idx_library_documents_scope_project ON library_documents (scope_project_id) WHERE scope_project_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

-- Rollback:
--   ALTER TABLE library_documents DROP COLUMN IF EXISTS scope_project_id;
