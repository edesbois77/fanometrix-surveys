// Generates and persists a Survey's AI intelligence report. Structural
// mirror of app/api/social/insights/route.ts — GET returns whatever's
// currently saved (or null); POST (re)generates a draft via
// lib/intelligence's analyseSurvey() and saves it to research_summaries.
// Editing/approving/publishing live in the edit|approve|publish sibling
// routes, unchanged from the conversation pattern. The survey id comes
// from the route segment (this route is nested under surveys/[id]),
// following the same convention as app/api/surveys/[id]/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { analyseSurvey } from "@/lib/intelligence/analysts/analyseSurvey";
import { getSummary, saveDraft } from "@/lib/intelligence/store";
import { IntelligenceError } from "@/lib/intelligence/types";
import { assertSimulatedResearchReady } from "@/lib/intelligence/assert-research-ready";

export type { SurveyIntelligenceReport } from "@/lib/intelligence/analysts/analyseSurvey";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { id } = await params;
  const data = await getSummary("survey", id, "research_summary");
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { id } = await params;
  const { confirm, research_project_evidence_id } = await req.json().catch(() => ({ confirm: false }));

  // Regenerating replaces the current draft outright, but once an admin
  // has edited/approved/published it, silently discarding that work
  // would be a real loss — require an explicit confirm to overwrite.
  const existing = await getSummary("survey", id, "research_summary");
  if (existing && existing.status !== "draft" && !confirm) {
    return NextResponse.json({
      error: `This summary is already ${existing.status}. Regenerating will replace it and reset it to Draft.`,
      requiresConfirm: true,
    }, { status: 409 });
  }

  try {
    await assertSimulatedResearchReady("survey", id, research_project_evidence_id);
    const report = await analyseSurvey(id);
    const saved  = await saveDraft({
      sourceType:  "survey",
      sourceId:    id,
      outputType:  "research_summary",
      content:     report,
      model:       "gpt-4o",
      generatedBy: session.workEmail,
    });
    return NextResponse.json({ data: saved });
  } catch (err) {
    if (err instanceof IntelligenceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to generate intelligence." }, { status: 500 });
  }
}
