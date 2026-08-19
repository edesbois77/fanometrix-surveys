// ── Manage → Study → Analysis: run + read AI proposals (admin/operator) ──────
// STUDY-MANAGE scoped (via analyseStudy/getLatestStudyAnalysis → canCurateStudies),
// NOT data entitlement. The client sends only the studyId in the path — never any
// evidence, numbers, or refs; the server builds the whole payload from Study Results.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/auth-server";
import { analyseStudy, getLatestStudyAnalysis } from "@/lib/studio/study-analysis-service";
import { enqueueCoreShadow } from "@/lib/studio/analytical-core-shadow";
import { enqueueResearchReasoner } from "@/lib/research-intelligence/enqueue";
import { getStudyResearchIntelligence, researchReasonerVisibleFor } from "@/lib/research-intelligence/read";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let session: AuthedUser;
  try { session = await requireUser(req); } catch { return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }

  const { access, run, proposals } = await analyseStudy(session, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (access === "not_found" || !run) return NextResponse.json({ error: "Study not found" }, { status: 404 });
  // SHADOW (Stage 5C): after a completed authoritative run, optionally mirror it in
  // the Analytical Core. Flag-gated (default OFF) and never-throws — it cannot affect
  // this response or the authoritative analysis. Dedupes on the run id.
  if (run.status === "completed") await enqueueCoreShadow({ sourceKind: "study", analysisRunId: run.id });
  // RESEARCH INTELLIGENCE (Stage C1): the SAME standard fresh-research lifecycle as surveys.
  // On a completed authoritative Study analysis, automatically enqueue the shared reasoner
  // over the Study's immutable evidence snapshot — generation-gated (its own kill-switch,
  // default ON, never the display flag), never-throws, deduped on the Study evidence
  // fingerprint. It cannot affect this response or the authoritative analysis; the Study
  // read falls back to the deterministic analysis if it never lands.
  if (run.status === "completed") await enqueueResearchReasoner({ sourceKind: "study", analysisRunId: run.id, evidenceFingerprint: run.evidence_hash });
  // A failed run is a 200 with status='failed' — the analyst sees the outcome, not a 500.
  return NextResponse.json({ run, proposals });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let session: AuthedUser;
  try { session = await requireUser(req); } catch { return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }

  const { access, run, proposals, narrative, themes, coverage, history, stale } = await getLatestStudyAnalysis(session, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (access === "not_found") return NextResponse.json({ error: "Study not found" }, { status: 404 });
  // Gated Research Intelligence (Stage C1): the VERIFIED shared-reasoner read for this
  // study's current evidence, or null. READ ONLY — the model is NEVER invoked here. Access
  // to the Study is already established above (admin-only Study curation), so entitlement is
  // preserved; exposure is the SAME display gate as surveys (researchReasonerVisibleFor).
  // ADDITIVE + subordinate: null ⇒ the deterministic Study analysis stands as the fallback.
  const researchIntelligence = run?.status === "completed"
    ? await getStudyResearchIntelligence(id, researchReasonerVisibleFor(session))
    : null;
  return NextResponse.json({ run, proposals, narrative, themes, coverage, history, stale, researchIntelligence });
}
