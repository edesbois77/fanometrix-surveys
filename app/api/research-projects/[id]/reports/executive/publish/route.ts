// Marks a Research Project's Executive Report as published. Structural
// mirror of app/api/surveys/[id]/insights/publish/route.ts. Requires
// approval first — publishing skips no step in the review workflow. This
// is purely the internal sign-off status (same as Survey/Conversation
// Intelligence) — it does not write to the public insights table; that's a
// deliberate, separate publishing workflow for a later phase.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { getSummary, publish } from "@/lib/intelligence/store";
import { logActivity } from "@/lib/research-project-activity";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { id } = await params;
  const existing = await getSummary("research_project", id, "executive_report");
  if (!existing) return NextResponse.json({ error: "No Executive Report found for this project." }, { status: 404 });
  if (existing.status !== "approved") {
    return NextResponse.json({ error: "Approve this report before publishing it." }, { status: 400 });
  }

  const saved = await publish(existing.id);
  await logActivity(id, "report_published", "Executive Report published", session.workEmail);
  return NextResponse.json({ data: saved });
}
