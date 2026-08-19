// ── Manage → Study → Findings: list + create (admin/operator) ────────────────
// STUDY-MANAGE scoped. Create from an ACCEPTED Analysis Proposal (evidence copied
// from the parent run's immutable snapshot) OR manually from ONE governed Study
// Result (server-resolved). The client submits only headline/commentary (+ which
// proposal or result) — never authoritative evidence, numbers, or identity.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/auth-server";
import { listFindings, createFindingFromProposal, createManualFinding, createFindingFromResearchInsight } from "@/lib/studio/study-finding-service";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let session: AuthedUser;
  try { session = await requireUser(req); } catch { return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }
  const res = await listFindings(session, id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res.data);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let session: AuthedUser;
  try { session = await requireUser(req); } catch { return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }

  const body = await req.json().catch(() => ({}));
  const editorial = { headline: body?.headline, commentary: body?.commentary };
  let res;
  if (body?.origin === "analysis_proposal" && typeof body?.proposalId === "string") {
    res = await createFindingFromProposal(session, id, body.proposalId, editorial);
  } else if (body?.origin === "manual" && typeof body?.evidenceRef === "string") {
    res = await createManualFinding(session, id, body.evidenceRef, editorial);
  } else if (body?.origin === "research_intelligence"
      && (body?.sourceKind === "survey" || body?.sourceKind === "study")
      && typeof body?.sourceId === "string" && typeof body?.insightId === "string" && typeof body?.evidenceFingerprint === "string") {
    // Human ACCEPTANCE of a verified Research Intelligence candidate → a DRAFT finding.
    // Nothing is published here; the reviewer still publishes explicitly.
    res = await createFindingFromResearchInsight(session, id,
      { sourceKind: body.sourceKind, sourceId: body.sourceId, insightId: body.insightId, evidenceFingerprint: body.evidenceFingerprint }, editorial);
  } else {
    return NextResponse.json({ error: "Provide origin 'analysis_proposal' + proposalId, 'manual' + evidenceRef, or 'research_intelligence' + {sourceKind, sourceId, insightId, evidenceFingerprint}." }, { status: 400 });
  }
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res.data, { status: res.status });
}
