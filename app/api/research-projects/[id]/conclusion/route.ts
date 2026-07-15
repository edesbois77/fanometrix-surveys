// Generates and persists a Research Project's Conclusion. Structural
// mirror of .../reports/executive/route.ts — GET returns whatever's
// currently saved (or null); POST (re)generates a draft via
// lib/intelligence's analyseConclusion() and saves it to research_summaries
// under source_type='research_project', output_type='conclusion'.
// Editing/approving/publishing live in the edit|approve|publish sibling
// routes, unchanged from the Executive Report pattern.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { analyseConclusion } from "@/lib/intelligence/analysts/analyseConclusion";
import { getSummary, saveDraft } from "@/lib/intelligence/store";
import { IntelligenceError } from "@/lib/intelligence/types";
import { logActivity } from "@/lib/research-project-activity";

export type { Conclusion } from "@/lib/intelligence/analysts/analyseConclusion";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { id } = await params;
  const data = await getSummary("research_project", id, "conclusion");
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { id } = await params;
  const { confirm } = await req.json().catch(() => ({ confirm: false }));

  // Regenerating replaces the current draft outright, but once an admin
  // has edited/approved/published it, silently discarding that work
  // would be a real loss — require an explicit confirm to overwrite.
  const existing = await getSummary("research_project", id, "conclusion");
  if (existing && existing.status !== "draft" && !confirm) {
    return NextResponse.json({
      error: `This conclusion is already ${existing.status}. Regenerating will replace it and reset it to Draft.`,
      requiresConfirm: true,
    }, { status: 409 });
  }

  try {
    const conclusion = await analyseConclusion(id);
    const saved  = await saveDraft({
      sourceType:  "research_project",
      sourceId:    id,
      outputType:  "conclusion",
      content:     conclusion,
      model:       "gpt-4o",
      generatedBy: session.workEmail,
    });
    await logActivity(id, "conclusion_generated", "Conclusion generated", session.workEmail);
    return NextResponse.json({ data: saved });
  } catch (err) {
    if (err instanceof IntelligenceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to generate the Conclusion." }, { status: 500 });
  }
}
