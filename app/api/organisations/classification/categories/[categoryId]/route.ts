import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { updateCategory, deleteCategory } from "@/lib/organisations/classification";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ categoryId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { categoryId } = await params;
  const body = await req.json();
  const r = await updateCategory(categoryId, { label: body.label, description: body.description, sortOrder: body.sortOrder });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ data: r.data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ categoryId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { categoryId } = await params;
  const r = await deleteCategory(categoryId);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r.data);
}
