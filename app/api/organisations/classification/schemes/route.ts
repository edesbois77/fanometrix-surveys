import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { listSchemes, createScheme } from "@/lib/organisations/classification";

export async function GET(req: NextRequest) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  try { return NextResponse.json({ data: await listSchemes() }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const body = await req.json();
  const r = await createScheme({ key: body.key, label: body.label, description: body.description });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ data: r.data }, { status: 201 });
}
