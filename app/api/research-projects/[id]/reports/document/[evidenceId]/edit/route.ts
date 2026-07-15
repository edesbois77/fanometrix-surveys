// Saves an admin's edits to a Document's project-specific Intelligence
// report. Structural mirror of app/api/surveys/[id]/insights/edit/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { getSummary, saveEdit } from "@/lib/intelligence/store";

export async function POST(req: NextRequest, { params }: { params: Promise<{ evidenceId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { evidenceId } = await params;
  const { edited_content } = await req.json();
  if (!edited_content) return NextResponse.json({ error: "edited_content is required" }, { status: 400 });

  const existing = await getSummary("document_project", evidenceId, "research_summary");
  if (!existing) return NextResponse.json({ error: "No Document Intelligence report found for this attachment." }, { status: 404 });

  const saved = await saveEdit(existing.id, edited_content);
  return NextResponse.json({ data: saved });
}
