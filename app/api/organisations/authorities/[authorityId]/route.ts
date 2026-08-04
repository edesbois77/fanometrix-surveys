import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { getAuthority, correctAuthority, ceaseAuthority, retireAuthority, determineAuthority } from "@/lib/organisations/authorities";

export async function GET(req: NextRequest, { params }: { params: Promise<{ authorityId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { authorityId } = await params;
  const auth = await getAuthority(authorityId);
  if (!auth) return NextResponse.json({ error: "Authority not found." }, { status: 404 });
  return NextResponse.json({ data: auth });
}

// PATCH: correction (scope/applicability), cessation ({cease:true}), or a determination
// ({determine:true, withinScope, constraintEvaluations, on}) - interpretation, persists nothing.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ authorityId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { authorityId } = await params;
  const body = await req.json();
  if (body.determine === true) {
    const r = await determineAuthority(authorityId, { on: body.on, withinScope: body.withinScope, constraintEvaluations: body.constraintEvaluations });
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ data: r.data });
  }
  if (body.cease === true) {
    const r = await ceaseAuthority(authorityId, body.effectiveTo);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ data: r.data });
  }
  const r = await correctAuthority(authorityId, { scope: body.scope, effectiveFrom: body.effectiveFrom, effectiveTo: body.effectiveTo });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ data: r.data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ authorityId: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { authorityId } = await params;
  const r = await retireAuthority(authorityId, session.workEmail);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r.data);
}
