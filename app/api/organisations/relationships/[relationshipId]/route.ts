import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { correctRelationship, ceaseRelationship, retireRelationship } from "@/lib/organisations/relationships";

// PATCH: correction (type/descriptor/applicability) or cessation ({cease:true}).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ relationshipId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { relationshipId } = await params;
  const body = await req.json();
  if (body.cease === true) {
    const r = await ceaseRelationship(relationshipId, body.effectiveTo);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ data: r.data });
  }
  const r = await correctRelationship(relationshipId, {
    typeId: body.typeId, descriptor: body.descriptor, effectiveFrom: body.effectiveFrom, effectiveTo: body.effectiveTo,
  });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ data: r.data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ relationshipId: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { relationshipId } = await params;
  const r = await retireRelationship(relationshipId, session.workEmail);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r.data);
}
