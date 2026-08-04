import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { correctIdentity, ceaseIdentity, replaceIdentity, retireIdentity } from "@/lib/organisations/identities";

// PATCH supports: correction (label/descriptor/applicability), cessation ({cease:true}),
// replacement ({replace:true, organisationId, transitionDate, label, ...}).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ identityId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { identityId } = await params;
  const body = await req.json();

  if (body.cease === true) {
    const r = await ceaseIdentity(identityId, body.effectiveTo);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ data: r.data });
  }
  if (body.replace === true) {
    const r = await replaceIdentity(identityId, body.organisationId, {
      label: body.label, descriptor: body.descriptor, effectiveTo: body.effectiveTo,
    }, body.transitionDate);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ data: r.data }, { status: 201 });
  }
  const r = await correctIdentity(identityId, {
    label: body.label, descriptor: body.descriptor, effectiveFrom: body.effectiveFrom, effectiveTo: body.effectiveTo,
  });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ data: r.data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ identityId: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { identityId } = await params;
  const r = await retireIdentity(identityId, session.workEmail);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r.data);
}
