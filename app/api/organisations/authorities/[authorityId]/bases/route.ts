import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { addBasis } from "@/lib/organisations/authorities";

// Add a basis reference to an Authority fact. Internal bases (office/relationship) are consumed by
// reference (FK-checked); external bases are reference-only opaque strings (R07 owns no semantics).
export async function POST(req: NextRequest, { params }: { params: Promise<{ authorityId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { authorityId } = await params;
  const body = await req.json();
  const r = await addBasis(authorityId, {
    basisKind: body.basisKind, officeId: body.officeId ?? null, relationshipId: body.relationshipId ?? null,
    externalRef: body.externalRef ?? null, note: body.note ?? null,
  });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ data: r.data }, { status: 201 });
}
