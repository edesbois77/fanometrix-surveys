// ── Manage → Study → Findings → Research candidates (read-only, admin) ───────
// Read-time projection of ALREADY-VERIFIED Research Intelligence (this Study + its member
// Surveys) into Report review candidates. NEVER calls a model, NEVER writes. The client
// receives only human-facing fields — internal evidence refs are stripped here. Accepting a
// candidate is a separate, explicit POST to /findings (origin='research_intelligence').
import { NextRequest, NextResponse } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/auth-server";
import { deriveStudyReportCandidates } from "@/lib/studio/report/research-candidates";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let session: AuthedUser;
  try { session = await requireUser(req); } catch { return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }
  const res = await deriveStudyReportCandidates(session, id);
  if (!res.ok || !res.data) return NextResponse.json({ error: res.error }, { status: res.status });
  // Strip internal refs — the UI never needs them; acceptance re-resolves them server-side.
  const candidates = res.data.candidates.map((c) => { const client = { ...c }; delete (client as { evidenceRefs?: unknown }).evidenceRefs; return client; });
  return NextResponse.json({ candidates });
}
