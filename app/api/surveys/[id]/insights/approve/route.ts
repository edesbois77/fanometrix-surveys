// Marks a Survey's research summary as approved — the admin's sign-off
// that it's ready to be published. Structural mirror of
// app/api/social/insights/approve/route.ts. Allowed from draft or edited;
// approving an already-approved summary is a harmless no-op. Not allowed
// once published (that would be a step backwards).
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { getSummary, approve } from "@/lib/intelligence/store";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { id } = await params;
  const existing = await getSummary("survey", id, "research_summary");
  if (!existing) return NextResponse.json({ error: "No research summary found for this survey." }, { status: 404 });
  if (existing.status === "published") {
    return NextResponse.json({ error: "This summary is already published." }, { status: 400 });
  }

  const saved = await approve(existing.id, session.workEmail);
  return NextResponse.json({ data: saved });
}
