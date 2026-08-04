import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { listOfficesForOrganisation, createOffice } from "@/lib/organisations/offices";

// Offices whose structural attachment governs this organisation ([id]).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  try { return NextResponse.json({ data: await listOfficesForOrganisation(id) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

// Create an Office and attach it to this organisation (optionally via a Unit).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  const body = await req.json();
  const r = await createOffice({
    title: body.title, effectiveFrom: body.effectiveFrom, effectiveTo: body.effectiveTo,
    governingOrganisationId: id, organisationUnitId: body.organisationUnitId ?? null,
    attachmentFrom: body.attachmentFrom, attachmentTo: body.attachmentTo,
  });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ data: r.data }, { status: 201 });
}
