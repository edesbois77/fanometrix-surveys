// Generates and persists a Conversation Search's AI intelligence report.
// GET returns whatever's currently saved (or null); POST (re)generates a
// draft via lib/intelligence's analyseConversation() and saves it to
// research_summaries. Editing/approving/publishing live in the
// edit|approve|publish sibling routes.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { analyseConversation } from "@/lib/intelligence/analysts/analyseConversation";
import { getSummary, saveDraft } from "@/lib/intelligence/store";
import { IntelligenceError } from "@/lib/intelligence/types";
import { assertSimulatedResearchReady } from "@/lib/intelligence/assert-research-ready";

export type { InsightReport } from "@/lib/intelligence/analysts/analyseConversation";

export async function GET(req: NextRequest) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const searchId = req.nextUrl.searchParams.get("search_id");
  if (!searchId) return NextResponse.json({ error: "search_id is required" }, { status: 400 });

  const data = await getSummary("conversation_search", searchId, "research_summary");
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { search_id, confirm, research_project_evidence_id } = await req.json();
  if (!search_id) return NextResponse.json({ error: "search_id is required" }, { status: 400 });

  // Regenerating replaces the current draft outright, but once an admin
  // has edited/approved/published it, silently discarding that work
  // would be a real loss — require an explicit confirm to overwrite.
  const existing = await getSummary("conversation_search", search_id, "research_summary");
  if (existing && existing.status !== "draft" && !confirm) {
    return NextResponse.json({
      error: `This summary is already ${existing.status}. Regenerating will replace it and reset it to Draft.`,
      requiresConfirm: true,
    }, { status: 409 });
  }

  try {
    await assertSimulatedResearchReady("social_search", search_id, research_project_evidence_id);
    const report = await analyseConversation(search_id);
    const saved  = await saveDraft({
      sourceType:  "conversation_search",
      sourceId:    search_id,
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
    return NextResponse.json({ error: "Failed to generate insights." }, { status: 500 });
  }
}
