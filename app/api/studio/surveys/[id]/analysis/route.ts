// ── Manage → Survey → Analysis (Generate / Regenerate + status) ──────────────
// POST generates (or regenerates) the survey's AI analysis; GET returns the
// current status for the Manage control. GENERATION is Manage authority
// (canManageSurvey — owner of the owning org, or admin); it is the ONLY place the
// model is invoked. Discover never calls this. A Regenerate is just another POST
// (a new run); a failed run never replaces a previously valid one.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { canManageSurvey } from "@/lib/studio/collection-health";
import { analyseSurvey, getSurveyAnalysisMeta, resolveSurveyAnalysisEligibility } from "@/lib/studio/survey-analysis-service";
import { enqueueCoreShadow } from "@/lib/studio/analytical-core-shadow";
import { enqueueResearchReasoner } from "@/lib/studio/research-reasoner";

async function authoriseManage(req: NextRequest, id: string): Promise<{ session: AuthedUser } | { error: NextResponse }> {
  let session: AuthedUser;
  try { session = await requireUser(req, ["admin", "publisher"]); }
  catch (err) { return { error: err as NextResponse }; }
  const { data: survey } = await supabaseAdmin.from("surveys").select("organisation_id").eq("id", id).is("deleted_at", null).single();
  if (!survey) return { error: NextResponse.json({ error: "Survey not found" }, { status: 404 }) };
  if (!canManageSurvey(session, survey)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { session };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await authoriseManage(req, id);
  if ("error" in auth) return auth.error;
  const [meta, eligibility] = await Promise.all([getSurveyAnalysisMeta(id), resolveSurveyAnalysisEligibility(id)]);
  return NextResponse.json({ ...meta, ...eligibility });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await authoriseManage(req, id);
  if ("error" in auth) return auth.error;
  const outcome = await analyseSurvey(auth.session, id);
  if (outcome.access === "not_found") return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  if (outcome.access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const status = outcome.run?.status ?? null;
  if (status === "failed") {
    return NextResponse.json({ status: "failed", error: outcome.run?.error ?? "Analysis could not be completed. Your previous analysis (if any) is unchanged." }, { status: 200 });
  }
  if (!outcome.run) {
    return NextResponse.json({ status: "empty", error: "This survey has not collected enough answers to analyse yet." }, { status: 200 });
  }
  // SHADOW (Stage 5C): flag-gated (default OFF), never-throws mirror of a completed
  // authoritative run — cannot affect this response or the authoritative analysis.
  if (outcome.run.status === "completed") await enqueueCoreShadow({ sourceKind: "survey", analysisRunId: outcome.run.id });
  // RESEARCH REASONER (gated integration): flag-gated (default OFF), never-throws async
  // reasoning over the completed run's immutable snapshot — cannot affect this response
  // or the authoritative analysis; Findings falls back to deterministic if it never lands.
  if (outcome.run.status === "completed") await enqueueResearchReasoner({ sourceKind: "survey", analysisRunId: outcome.run.id });
  return NextResponse.json({ status: outcome.run.status, generatedAt: outcome.run.completed_at });
}
