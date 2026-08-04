import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { listNames, addName, recordNameChange } from "@/lib/organisations/names";

// Names for a subject. Defaults to the organisation subject ([id]); ?subjectId &
// ?subjectKind allow addressing a unit subject within the same organisation.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  const subjectId = new URL(req.url).searchParams.get("subjectId") ?? id;
  try {
    return NextResponse.json({ data: await listNames(subjectId) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST adds an additional Name, or — with {mode:"change"} — records a genuine name
// change (close current primary at the transition date, open a new primary).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  const body = await req.json();
  const subjectId = body.subjectId ?? id;
  const subjectKind = body.subjectKind ?? "organisation";

  if (body.mode === "change") {
    const r = await recordNameChange(subjectId, subjectKind, body.value, body.transitionDate, {
      nameForm: body.nameForm, language: body.language, script: body.script,
    });
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ data: r.data }, { status: 201 });
  }

  const r = await addName(subjectId, subjectKind, {
    value: body.value, nameForm: body.nameForm, language: body.language, script: body.script,
    effectiveFrom: body.effectiveFrom, effectiveTo: body.effectiveTo,
  });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ data: r.data }, { status: 201 });
}
