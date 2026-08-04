import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { getOffice, correctOffice, ceaseOffice, retireOffice } from "@/lib/organisations/offices";

export async function GET(req: NextRequest, { params }: { params: Promise<{ officeId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { officeId } = await params;
  const office = await getOffice(officeId);
  if (!office) return NextResponse.json({ error: "Office not found." }, { status: 404 });
  return NextResponse.json({ data: office });
}

// PATCH: correction (title/applicability) or cessation ({cease:true}).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ officeId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { officeId } = await params;
  const body = await req.json();
  if (body.cease === true) {
    const r = await ceaseOffice(officeId, body.effectiveTo);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ data: r.data });
  }
  const r = await correctOffice(officeId, { title: body.title, effectiveFrom: body.effectiveFrom, effectiveTo: body.effectiveTo });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ data: r.data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ officeId: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { officeId } = await params;
  const r = await retireOffice(officeId, session.workEmail);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r.data);
}
