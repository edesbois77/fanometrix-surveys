// Saves an admin's edits to a Research Project's Full Research Report.
// Structural mirror of ../../executive/edit/route.ts. The original AI
// draft (research_summaries.content) is never touched — edits always land
// in edited_content, and status moves to "edited". This is also what
// guarantees editing a theme deep-dive can never alter or regenerate the
// Executive Report: this route only ever writes to the Full Research
// Report's own row (output_type='full_research_report'), a completely
// separate row from the Executive Report's own.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { getSummary, saveEdit } from "@/lib/intelligence/store";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { id } = await params;
  const { edited_content } = await req.json();
  if (!edited_content) return NextResponse.json({ error: "edited_content is required" }, { status: 400 });

  const existing = await getSummary("research_project", id, "full_research_report");
  if (!existing) return NextResponse.json({ error: "No Full Research Report found for this project." }, { status: 404 });

  const saved = await saveEdit(existing.id, edited_content);
  return NextResponse.json({ data: saved });
}
