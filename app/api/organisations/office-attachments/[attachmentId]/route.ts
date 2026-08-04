import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { updateAttachment, retireAttachment } from "@/lib/organisations/offices";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ attachmentId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { attachmentId } = await params;
  const body = await req.json();
  const r = await updateAttachment(attachmentId, {
    governingOrganisationId: body.governingOrganisationId, organisationUnitId: body.organisationUnitId,
    effectiveFrom: body.effectiveFrom, effectiveTo: body.effectiveTo,
  });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ data: r.data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ attachmentId: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { attachmentId } = await params;
  const r = await retireAttachment(attachmentId, session.workEmail);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r.data);
}
