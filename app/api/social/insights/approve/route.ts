// Marks a Conversation Search's research summary as approved — the
// admin's sign-off that it's ready to be published. Allowed from draft
// or edited; approving an already-approved summary is a harmless no-op.
// Not allowed once published (that would be a step backwards).
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { getSummary, approve } from "@/lib/intelligence/store";

export async function POST(req: NextRequest) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { search_id } = await req.json();
  if (!search_id) return NextResponse.json({ error: "search_id is required" }, { status: 400 });

  const existing = await getSummary("conversation_search", search_id, "research_summary");
  if (!existing) return NextResponse.json({ error: "No research summary found for this search." }, { status: 404 });
  if (existing.status === "published") {
    return NextResponse.json({ error: "This summary is already published." }, { status: 400 });
  }

  const saved = await approve(existing.id, session.workEmail);
  return NextResponse.json({ data: saved });
}
