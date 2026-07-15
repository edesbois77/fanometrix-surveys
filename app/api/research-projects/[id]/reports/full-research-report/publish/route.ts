// Marks a Research Project's Full Research Report as published.
// Structural mirror of ../../executive/publish/route.ts. Requires approval
// first — publishing skips no step in the review workflow. Unlike
// Executive Report/Editorial Article (which build this same route but
// never surface a Publish button on screen), the Full Research Report's
// own review page genuinely renders one — the user asked for the full
// four-stage lifecycle to be real here, not just plumbed.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { getSummary, publish } from "@/lib/intelligence/store";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { id } = await params;
  const existing = await getSummary("research_project", id, "full_research_report");
  if (!existing) return NextResponse.json({ error: "No Full Research Report found for this project." }, { status: 404 });
  if (existing.status !== "approved") {
    return NextResponse.json({ error: "Approve this report before publishing it." }, { status: 400 });
  }

  const saved = await publish(existing.id);
  return NextResponse.json({ data: saved });
}
