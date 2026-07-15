// Marks a document's global analysis as approved and promotes the
// approved fields onto library_documents' own queryable columns
// (promote-approved-metadata.ts) — this is the moment a document actually
// becomes visible/searchable in the Research Library. No 'published'
// state exists for this table (see supabase-migration-101.sql), so
// re-approving an already-approved analysis is a harmless no-op, same as
// Survey Intelligence's own approve route.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { getCurrentAnalysis, approveAnalysis } from "@/lib/library-documents/analysis-store";
import { promoteApprovedMetadata } from "@/lib/library-documents/promote-approved-metadata";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { id } = await params;
  const existing = await getCurrentAnalysis(id);
  if (!existing) return NextResponse.json({ error: "No analysis found for this document." }, { status: 404 });

  const saved = await approveAnalysis(existing.id, session.workEmail);
  await promoteApprovedMetadata(id, saved.edited_content ?? saved.content, session.workEmail);

  return NextResponse.json({ data: saved });
}
