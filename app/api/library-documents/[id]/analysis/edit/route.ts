// Saves a reviewer's edits to a document's global analysis. Structural
// mirror of app/api/surveys/[id]/insights/edit/route.ts. The original AI
// draft (content) is never touched — edits always land in edited_content,
// status moves to "edited".
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { getCurrentAnalysis, saveAnalysisEdit } from "@/lib/library-documents/analysis-store";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { id } = await params;
  const { edited_content } = await req.json();
  if (!edited_content) return NextResponse.json({ error: "edited_content is required" }, { status: 400 });

  const existing = await getCurrentAnalysis(id);
  if (!existing) return NextResponse.json({ error: "No analysis found for this document." }, { status: 404 });

  const saved = await saveAnalysisEdit(existing.id, edited_content);
  return NextResponse.json({ data: saved });
}
