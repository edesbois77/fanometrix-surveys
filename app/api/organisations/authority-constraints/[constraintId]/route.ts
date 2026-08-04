import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { removeConstraint } from "@/lib/organisations/authorities";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ constraintId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { constraintId } = await params;
  const r = await removeConstraint(constraintId);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r.data);
}
