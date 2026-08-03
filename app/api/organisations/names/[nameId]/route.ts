import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { correctName, retireName } from "@/lib/organisations/names";

// PATCH = CORRECTION of a Name fact in place (no fabricated history).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ nameId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { nameId } = await params;
  const body = await req.json();
  const r = await correctName(nameId, {
    value: body.value, nameForm: body.nameForm, language: body.language, script: body.script,
    effectiveFrom: body.effectiveFrom, effectiveTo: body.effectiveTo,
  });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ data: r.data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ nameId: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { nameId } = await params;
  const r = await retireName(nameId, session.workEmail);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r.data);
}
