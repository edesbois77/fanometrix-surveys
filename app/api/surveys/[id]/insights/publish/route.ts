// Marks a Survey's research summary as published. Structural mirror of
// app/api/social/insights/publish/route.ts. Requires approval first —
// publishing skips no step in the review workflow.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { getSummary, publish } from "@/lib/intelligence/store";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { id } = await params;
  const existing = await getSummary("survey", id, "research_summary");
  if (!existing) return NextResponse.json({ error: "No research summary found for this survey." }, { status: 404 });
  if (existing.status !== "approved") {
    return NextResponse.json({ error: "Approve this summary before publishing it." }, { status: 400 });
  }

  const saved = await publish(existing.id);
  return NextResponse.json({ data: saved });
}
