import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { reparentUnit, renameUnit, softDeleteUnit, restoreUnit } from "@/lib/organisations/units";

// PATCH supports: rename ({name}), re-parent ({parentUnitId}), restore ({restore:true}).
// organisation_id is never accepted here — cross-organisation movement is forbidden.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ unitId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { unitId } = await params;
  const body = await req.json();

  if (body.restore === true) {
    const r = await restoreUnit(unitId);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ data: r.data });
  }
  if (body.parentUnitId !== undefined) {
    const r = await reparentUnit(unitId, body.parentUnitId);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ data: r.data });
  }
  if (body.name !== undefined) {
    const r = await renameUnit(unitId, body.name);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ data: r.data });
  }
  return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ unitId: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { unitId } = await params;
  const r = await softDeleteUnit(unitId, session.workEmail);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r.data);
}
