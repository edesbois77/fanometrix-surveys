// Marks a Research Project's Conclusion as published — the moment it's
// handed to Knowledge. Structural mirror of .../reports/executive/publish/
// route.ts. Requires approval first — publishing skips no step in the
// review workflow. Logs as "knowledge_article_created" rather than a
// "conclusion_published" — that event type already exists (migration 070)
// and was named for exactly this moment: something landing in Knowledge.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { getSummary, publish } from "@/lib/intelligence/store";
import { logActivity } from "@/lib/research-project-activity";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { id } = await params;
  const existing = await getSummary("research_project", id, "conclusion");
  if (!existing) return NextResponse.json({ error: "No Conclusion found for this project." }, { status: 404 });
  if (existing.status !== "approved") {
    return NextResponse.json({ error: "Approve this conclusion before publishing it." }, { status: 400 });
  }

  const saved = await publish(existing.id);
  await logActivity(id, "knowledge_article_created", "Conclusion published to Knowledge", session.workEmail);
  return NextResponse.json({ data: saved });
}
