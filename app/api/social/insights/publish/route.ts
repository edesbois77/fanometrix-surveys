// Marks a Conversation Search's research summary as published. Requires
// approval first — publishing skips no step in the review workflow.
// Reports doesn't consume "published" summaries yet; this just records
// the sign-off so that surface has something to read once it exists.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { getSummary, publish } from "@/lib/intelligence/store";
import { searchInOrg } from "@/lib/social-listening/org-scope";

export async function POST(req: NextRequest) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { search_id } = await req.json();
  if (!search_id) return NextResponse.json({ error: "search_id is required" }, { status: 400 });
  // ORG-006 WP-02 — only publish an insight for a search in the Current Organisation.
  if (!(await searchInOrg(search_id, session.organisationId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing = await getSummary("conversation_search", search_id, "research_summary");
  if (!existing) return NextResponse.json({ error: "No research summary found for this search." }, { status: 404 });
  if (existing.status !== "approved") {
    return NextResponse.json({ error: "Approve this summary before publishing it." }, { status: 400 });
  }

  const saved = await publish(existing.id);
  return NextResponse.json({ data: saved });
}
