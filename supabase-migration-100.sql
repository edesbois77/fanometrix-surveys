-- Migration 100: Research Library storage bucket (private)
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Storage bucket for library_documents' underlying files (migration 099).
-- Deliberately the opposite shape of migration 097's report-images bucket:
-- that one is public, for small images meant to render directly in a
-- report. This one is private — uploaded documents may be confidential
-- client material (library_documents.confidentiality exists for exactly
-- this) — so there is no public-read policy at all. Every read (preview,
-- download) and every write goes through this app's API routes using the
-- service-role client (supabaseAdmin), which bypasses RLS entirely, same
-- as every other write in this app already does — so, also like 097, no
-- policy is required for the service role's own access. Client access is
-- always via a short-lived signed URL (supabaseAdmin.storage.from(...)
-- .createSignedUrl(...)/.createSignedUploadUrl(...)), generated on demand,
-- never a permanent public URL.

INSERT INTO storage.buckets (id, name, public)
VALUES ('library-documents', 'library-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Rollback:
--   DELETE FROM storage.buckets WHERE id = 'library-documents';
