// Generates and persists a Research Project's Aspect Synthesis — the first
// synthesis layer of Analysis (structured evidence grouped by research aspect,
// each aspect synthesised into summary / key findings / recommended actions,
// with every finding linked to the evidence that supports it).
//
// Structural mirror of the Key Findings route: GET fetches the current stored
// synthesis; POST regenerates it outright (no confirm gate — nothing reviewed to
// lose, same as key_findings). Reuses research_summaries via store.ts.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { analyseAspectSynthesis, countRelevantEvidenceSince } from "@/lib/intelligence/analysts/analyseAspectSynthesis";
import { getSummary, saveDraft } from "@/lib/intelligence/store";
import { IntelligenceError } from "@/lib/intelligence/types";
import { logActivity } from "@/lib/research-project-activity";

export const maxDuration = 300; // per-aspect synthesis calls run in parallel

export type {
  AspectSynthesisReport, AspectSection, AspectKeyFinding, AspectRecommendedAction, EvidenceRef,
} from "@/lib/intelligence/analysts/analyseAspectSynthesis";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  const data = await getSummary("research_project", id, "aspect_synthesis");
  // Staleness: how many relevant conversations were collected AFTER this
  // synthesis was generated. new_since > 0 => Out of date. Never auto-regenerated.
  let freshness = { stale: false, new_since: 0, generated_at: null as string | null };
  if (data?.generated_at) {
    const newSince = await countRelevantEvidenceSince(id, data.generated_at);
    freshness = { stale: newSince > 0, new_since: newSince, generated_at: data.generated_at };
  }
  return NextResponse.json({ data, freshness });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;

  try {
    const report = await analyseAspectSynthesis(id);
    const saved = await saveDraft({
      sourceType:  "research_project",
      sourceId:    id,
      outputType:  "aspect_synthesis",
      content:     report,
      model:       "gpt-4o",
      generatedBy: session.workEmail,
    });
    await logActivity(id, "report_generated", "Aspect synthesis generated", session.workEmail);
    return NextResponse.json({ data: saved });
  } catch (err) {
    if (err instanceof IntelligenceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to generate the analysis." }, { status: 500 });
  }
}
