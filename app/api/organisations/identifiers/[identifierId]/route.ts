import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { correctIdentifier, retireIdentifier, deleteIdentifier } from "@/lib/organisations/identifiers";

// PATCH = correct in place, or {retire:true} to close applicability at today.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ identifierId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { identifierId } = await params;
  const body = await req.json();
  if (body.retire === true) {
    const r = await retireIdentifier(identifierId);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ data: r.data });
  }
  const r = await correctIdentifier(identifierId, {
    scheme: body.scheme, designation: body.designation, authority: body.authority, namespace: body.namespace,
    effectiveFrom: body.effectiveFrom, effectiveTo: body.effectiveTo,
  });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ data: r.data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ identifierId: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { identifierId } = await params;
  const r = await deleteIdentifier(identifierId, session.workEmail);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r.data);
}
