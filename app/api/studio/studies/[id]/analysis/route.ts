// ── Manage → Study → Analysis: run + read AI proposals (admin/operator) ──────
// STUDY-MANAGE scoped (via analyseStudy/getLatestStudyAnalysis → canCurateStudies),
// NOT data entitlement. The client sends only the studyId in the path — never any
// evidence, numbers, or refs; the server builds the whole payload from Study Results.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/auth-server";
import { analyseStudy, getLatestStudyAnalysis } from "@/lib/studio/study-analysis-service";
import { enqueueCoreShadow } from "@/lib/studio/analytical-core-shadow";

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
  return NextResponse.json({ run, proposals, narrative, themes, coverage, history, stale });
}
