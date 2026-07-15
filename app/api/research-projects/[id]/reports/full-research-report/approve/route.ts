// Marks a Research Project's Full Research Report as approved — the
// admin's sign-off that it's ready to be published. Structural mirror of
// ../../executive/approve/route.ts. Allowed from draft or edited;
// approving an already-approved report is a harmless no-op. Not allowed
// once published (that would be a step backwards).
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { getSummary, approve } from "@/lib/intelligence/store";
import { logActivity } from "@/lib/research-project-activity";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { id } = await params;
  const existing = await getSummary("research_project", id, "full_research_report");
  if (!existing) return NextResponse.json({ error: "No Full Research Report found for this project." }, { status: 404 });
  if (existing.status === "published") {
    return NextResponse.json({ error: "This report is already published." }, { status: 400 });
  }

  const saved = await approve(existing.id, session.workEmail);
  await logActivity(id, "full_research_report_approved", "Full Research Report approved", session.workEmail);
  return NextResponse.json({ data: saved });
}
