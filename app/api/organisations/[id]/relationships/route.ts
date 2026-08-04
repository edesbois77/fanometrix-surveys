import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { listRelationshipsForSubject, createRelationship } from "@/lib/organisations/relationships";

// Relationships in which the organisation ([id]) — or a unit subject via ?subjectId —
// participates. A relationship is not owned by one organisation; it is listed for each
// participating subject.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  const subjectId = new URL(req.url).searchParams.get("subjectId") ?? id;
  try { return NextResponse.json({ data: await listRelationshipsForSubject(subjectId) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

// Create a relationship with its participants (≥2), atomically.
export async function POST(req: NextRequest) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const body = await req.json();
  const r = await createRelationship({
    typeId: body.typeId, descriptor: body.descriptor,
    effectiveFrom: body.effectiveFrom, effectiveTo: body.effectiveTo,
    participants: body.participants ?? [],
  });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ data: r.data }, { status: 201 });
}
