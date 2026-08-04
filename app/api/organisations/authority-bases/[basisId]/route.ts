import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { removeBasis } from "@/lib/organisations/authorities";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ basisId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { basisId } = await params;
  const r = await removeBasis(basisId);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r.data);
}
