// Marks a Conversation Search's research summary as published. Requires
// approval first — publishing skips no step in the review workflow.
// Reports doesn't consume "published" summaries yet; this just records
// the sign-off so that surface has something to read once it exists.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { getSummary, publish } from "@/lib/intelligence/store";

export async function POST(req: NextRequest) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { search_id } = await req.json();
  if (!search_id) return NextResponse.json({ error: "search_id is required" }, { status: 400 });

  const existing = await getSummary("conversation_search", search_id, "research_summary");
  if (!existing) return NextResponse.json({ error: "No research summary found for this search." }, { status: 404 });
  if (existing.status !== "approved") {
    return NextResponse.json({ error: "Approve this summary before publishing it." }, { status: 400 });
  }

  const saved = await publish(existing.id);
  return NextResponse.json({ data: saved });
}
