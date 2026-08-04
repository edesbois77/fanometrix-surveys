import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { listAttachments, attachOffice } from "@/lib/organisations/offices";

export async function GET(req: NextRequest, { params }: { params: Promise<{ officeId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { officeId } = await params;
  try { return NextResponse.json({ data: await listAttachments(officeId) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

// Attach the Office to a governing Organisation (optionally via a Unit). FR-010 exclusivity enforced.
export async function POST(req: NextRequest, { params }: { params: Promise<{ officeId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { officeId } = await params;
  const body = await req.json();
  const r = await attachOffice(officeId, {
    governingOrganisationId: body.governingOrganisationId, organisationUnitId: body.organisationUnitId ?? null,
    effectiveFrom: body.effectiveFrom, effectiveTo: body.effectiveTo,
  });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ data: r.data }, { status: 201 });
}
