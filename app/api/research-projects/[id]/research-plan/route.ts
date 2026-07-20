// The Research Plan — the project's methodology briefing
// (docs/research-plan-blueprint.md, Phase 1). Structural sibling of the
// aspect-synthesis route: GET fetches the current plan; POST regenerates it;
// PATCH edits (saves researcher changes) or approves. Reuses research_summaries
// via store.ts and the draft→edited→approved lifecycle.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { analyseResearchPlan } from "@/lib/intelligence/analysts/analyseResearchPlan";
import { getSummary, saveDraft, saveEdit, approve } from "@/lib/intelligence/store";
import { IntelligenceError } from "@/lib/intelligence/types";
import { logActivity } from "@/lib/research-project-activity";
import type { ResearchPlan } from "@/lib/research-plan";

export const maxDuration = 300;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  const data = await getSummary<ResearchPlan>("research_project", id, "research_plan");
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  try {
    const plan = await analyseResearchPlan(id);
    const saved = await saveDraft<ResearchPlan>({
      sourceType: "research_project", sourceId: id, outputType: "research_plan",
      content: plan, model: plan.model, generatedBy: session.workEmail,
    });
    await logActivity(id, "report_generated", "Research Plan generated", session.workEmail);
    return NextResponse.json({ data: saved });
  } catch (err) {
    if (err instanceof IntelligenceError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to generate the research plan." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body?.action as string | undefined;

  const current = await getSummary<ResearchPlan>("research_project", id, "research_plan");
  if (!current) return NextResponse.json({ error: "No research plan to update yet." }, { status: 404 });

  try {
    if (action === "approve") {
      const saved = await approve(current.id, session.workEmail);
      await logActivity(id, "report_approved", "Research Plan approved", session.workEmail);
      return NextResponse.json({ data: saved });
    }
    if (action === "edit") {
      const content = body?.content as ResearchPlan | undefined;
      if (!content) return NextResponse.json({ error: "content is required to edit" }, { status: 400 });
      const saved = await saveEdit<ResearchPlan>(current.id, { ...content, edited: true });
      return NextResponse.json({ data: saved });
    }
    return NextResponse.json({ error: "action must be 'edit' or 'approve'" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 });
  }
}
