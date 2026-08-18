// ── Manage → Study → Analysis: review one proposal (admin/operator) ──────────
// Editorial edit (headline/explanation only), accept, or dismiss. The server refuses
// any attempt to mutate type, evidence_refs, run linkage, provider/model/snapshot or
// numbers — those are immutable. Path integrity: the proposal must belong to a run of
// THIS study (existence-preserving 404 otherwise).
import { NextRequest, NextResponse } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/auth-server";
import { reviewProposal, type ProposalAction } from "@/lib/studio/study-analysis-service";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; proposalId: string }> }) {
  const { id, proposalId } = await ctx.params;
  let session: AuthedUser;
  try { session = await requireUser(req); } catch { return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");
  let parsed: ProposalAction;
  if (action === "accept") parsed = { action: "accept" };
  else if (action === "dismiss") parsed = { action: "dismiss" };
  else if (action === "edit") parsed = { action: "edit", headline: body?.headline, explanation: body?.explanation };
  else return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const res = await reviewProposal(session, id, proposalId, parsed);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ proposal: res.proposal });
}
