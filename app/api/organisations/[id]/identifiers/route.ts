import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { listIdentifiers, addIdentifier } from "@/lib/organisations/identifiers";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  const subjectId = new URL(req.url).searchParams.get("subjectId") ?? id;
  try {
    return NextResponse.json({ data: await listIdentifiers(subjectId) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  const body = await req.json();
  const r = await addIdentifier(body.subjectId ?? id, body.subjectKind ?? "organisation", {
    scheme: body.scheme, designation: body.designation, authority: body.authority, namespace: body.namespace,
    effectiveFrom: body.effectiveFrom, effectiveTo: body.effectiveTo,
  });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ data: r.data }, { status: 201 });
}
