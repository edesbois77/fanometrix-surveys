// Saves an admin's edits to a Conversation Search's research summary.
// The original AI draft (research_summaries.content) is never touched —
// edits always land in edited_content, and status moves to "edited".
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { getSummary, saveEdit } from "@/lib/intelligence/store";
import { searchInOrg } from "@/lib/social-listening/org-scope";

export async function POST(req: NextRequest) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { search_id, edited_content } = await req.json();
  if (!search_id) return NextResponse.json({ error: "search_id is required" }, { status: 400 });
  if (!edited_content) return NextResponse.json({ error: "edited_content is required" }, { status: 400 });
  // ORG-006 WP-02 — only edit an insight for a search in the Current Organisation.
  if (!(await searchInOrg(search_id, session.organisationId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing = await getSummary("conversation_search", search_id, "research_summary");
  if (!existing) return NextResponse.json({ error: "No research summary found for this search." }, { status: 404 });

  const saved = await saveEdit(existing.id, edited_content);
  return NextResponse.json({ data: saved });
}
