import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { listCategories, createCategory } from "@/lib/organisations/classification";

export async function GET(req: NextRequest, { params }: { params: Promise<{ schemeId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { schemeId } = await params;
  try { return NextResponse.json({ data: await listCategories(schemeId) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ schemeId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { schemeId } = await params;
  const body = await req.json();
  const r = await createCategory(schemeId, { key: body.key, label: body.label, description: body.description, sortOrder: body.sortOrder });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ data: r.data }, { status: 201 });
}
