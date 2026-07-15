// Single Library Document's own metadata — status polling while the
// automatic upload→extract→analyse pipeline runs, plus the approved,
// queryable fields once past that. The richer analysis content lives at
// the sibling analysis/route.ts, not here.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { createDownloadUrl } from "@/lib/library-documents/storage";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from("library_documents")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });

  // Best-effort — a missing/expired file must never break the metadata
  // response, since the original document may legitimately still be
  // uploading (status='uploaded') the first time this is polled.
  let previewUrl: string | null = null;
  try {
    previewUrl = await createDownloadUrl(data.storage_path);
  } catch {
    previewUrl = null;
  }

  return NextResponse.json({ data: { ...data, preview_url: previewUrl } });
}
