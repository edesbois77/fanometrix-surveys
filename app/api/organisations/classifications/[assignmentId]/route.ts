import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { retireAssignment } from "@/lib/organisations/classification";

// Retire a (non-system) classification assignment by closing its applicability today.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ assignmentId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { assignmentId } = await params;
  const r = await retireAssignment(assignmentId);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ data: r.data });
}
