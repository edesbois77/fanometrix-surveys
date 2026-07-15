-- Migration 097: Report image infrastructure
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Infrastructure only — no existing report type uses this yet. Creates a
-- public Storage bucket for images manually uploaded into report content
-- (the forthcoming Editorial Article, and potentially other report types
-- later). All uploads go through app/api/report-images/route.ts using
-- the service-role client (supabaseAdmin), the same pattern every other
-- write in this app already uses — so no INSERT/UPDATE/DELETE policy is
-- needed here, the service role bypasses RLS entirely. The bucket is
-- public so images render directly in a report's on-screen view, its
-- print/PDF output, and any future PPTX export without a signed-URL
-- round-trip.

INSERT INTO storage.buckets (id, name, public)
VALUES ('report-images', 'report-images', true)
ON CONFLICT (id) DO NOTHING;

-- Explicit public-read policy on top of the bucket's own public flag —
-- belt and braces, and makes the intended access model visible in the
-- schema rather than only implied by the bucket setting.
CREATE POLICY "Public read for report-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'report-images');

-- Rollback:
--   DROP POLICY IF EXISTS "Public read for report-images" ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'report-images';
