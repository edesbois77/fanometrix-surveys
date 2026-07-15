// Marks a Document's project-specific Intelligence report as approved.
// Structural mirror of app/api/surveys/[id]/insights/approve/route.ts.
// Allowed from draft or edited; approving an already-approved summary is a
// harmless no-op. Not allowed once published.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { getSummary, approve } from "@/lib/intelligence/store";

export async function POST(req: NextRequest, { params }: { params: Promise<{ evidenceId: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { evidenceId } = await params;
  const existing = await getSummary("document_project", evidenceId, "research_summary");
  if (!existing) return NextResponse.json({ error: "No Document Intelligence report found for this attachment." }, { status: 404 });
  if (existing.status === "published") {
    return NextResponse.json({ error: "This summary is already published." }, { status: 400 });
  }

  const saved = await approve(existing.id, session.workEmail);
  return NextResponse.json({ data: saved });
}
