import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { addConstraint } from "@/lib/organisations/authorities";

// Add a material constraint (threshold/jurisdiction/condition/limit) to an Authority fact.
export async function POST(req: NextRequest, { params }: { params: Promise<{ authorityId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { authorityId } = await params;
  const body = await req.json();
  const r = await addConstraint(authorityId, body.constraintType, body.descriptor);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ data: r.data }, { status: 201 });
}
