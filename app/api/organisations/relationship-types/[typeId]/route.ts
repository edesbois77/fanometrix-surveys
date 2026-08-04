import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { updateType, deleteType } from "@/lib/organisations/relationships";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ typeId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { typeId } = await params;
  const body = await req.json();
  const r = await updateType(typeId, { label: body.label, description: body.description, directionality: body.directionality });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ data: r.data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ typeId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { typeId } = await params;
  const r = await deleteType(typeId);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r.data);
}
