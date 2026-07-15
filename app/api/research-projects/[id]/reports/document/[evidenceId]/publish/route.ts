// Marks a Document's project-specific Intelligence report as published.
// Structural mirror of app/api/surveys/[id]/insights/publish/route.ts.
// Requires approval first — publishing skips no step in the review workflow.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { getSummary, publish } from "@/lib/intelligence/store";

export async function POST(req: NextRequest, { params }: { params: Promise<{ evidenceId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { evidenceId } = await params;
  const existing = await getSummary("document_project", evidenceId, "research_summary");
  if (!existing) return NextResponse.json({ error: "No Document Intelligence report found for this attachment." }, { status: 404 });
  if (existing.status !== "approved") {
    return NextResponse.json({ error: "Approve this summary before publishing it." }, { status: 400 });
  }

  const saved = await publish(existing.id);
  return NextResponse.json({ data: saved });
}
