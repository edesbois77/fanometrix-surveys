import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { updateScheme, deleteScheme } from "@/lib/organisations/classification";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ schemeId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { schemeId } = await params;
  const body = await req.json();
  const r = await updateScheme(schemeId, { label: body.label, description: body.description });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ data: r.data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ schemeId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { schemeId } = await params;
  const r = await deleteScheme(schemeId);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r.data);
}
