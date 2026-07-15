// Saves an admin's edits to a Research Project's Executive Report.
// Structural mirror of app/api/surveys/[id]/insights/edit/route.ts. The
// original AI draft (research_summaries.content) is never touched — edits
// always land in edited_content, and status moves to "edited".
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { getSummary, saveEdit } from "@/lib/intelligence/store";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { id } = await params;
  const { edited_content } = await req.json();
  if (!edited_content) return NextResponse.json({ error: "edited_content is required" }, { status: 400 });

  const existing = await getSummary("research_project", id, "executive_report");
  if (!existing) return NextResponse.json({ error: "No Executive Report found for this project." }, { status: 404 });

  const saved = await saveEdit(existing.id, edited_content);
  return NextResponse.json({ data: saved });
}
