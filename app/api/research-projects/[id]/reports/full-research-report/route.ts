// Generates and persists a Research Project's Full Research Report.
// Structural mirror of ../executive/route.ts — GET returns whatever's
// currently saved (or null); POST (re)generates a draft via
// lib/intelligence's analyseFullResearchReport() and saves it to
// research_summaries under source_type='research_project',
// output_type='full_research_report'. Editing/approving/publishing live
// in the edit|approve|publish sibling routes, unchanged from the
// Executive Report/Editorial Article pattern.
//
// Deliberately no auto-generate anywhere in this route or the page that
// calls it — generation only ever happens from an explicit POST, itself
// only ever triggered by a real user click (either on the Full Research
// Report page's own "Generate" button, or a future direct trigger from
// ReportsSection), never on page load.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { analyseFullResearchReport } from "@/lib/intelligence/analysts/analyseFullResearchReport";
import { getSummary, saveDraft } from "@/lib/intelligence/store";
import { IntelligenceError } from "@/lib/intelligence/types";
import { logActivity } from "@/lib/research-project-activity";

export type { FullResearchReport } from "@/lib/intelligence/analysts/analyseFullResearchReport";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { id } = await params;
  const data = await getSummary("research_project", id, "full_research_report");
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
  const existing = await getSummary("research_project", id, "full_research_report");
  if (existing && existing.status !== "draft" && !confirm) {
    return NextResponse.json({
      error: `This report is already ${existing.status}. Regenerating will replace it and reset it to Draft.`,
      requiresConfirm: true,
    }, { status: 409 });
  }

  try {
    const report = await analyseFullResearchReport(id);
    const saved  = await saveDraft({
      sourceType:  "research_project",
      sourceId:    id,
      outputType:  "full_research_report",
      content:     report,
      model:       "gpt-4o",
      generatedBy: session.workEmail,
    });
    await logActivity(id, "full_research_report_generated", "Full Research Report generated", session.workEmail);
    return NextResponse.json({ data: saved });
  } catch (err) {
    if (err instanceof IntelligenceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to generate the Full Research Report." }, { status: 500 });
  }
}
