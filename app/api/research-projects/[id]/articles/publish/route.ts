// Marks a Research Project's Editorial Article as published — the
// authoring sign-off that it's ready to share. Structural mirror of
// .../conclusion/publish/route.ts. Requires approval first — publishing
// skips no step in the review workflow.
//
// Unlike Conclusion (which logs "knowledge_article_created" because
// publishing hands it to a real downstream consumer, Knowledge), there is
// no such consumer for a published Editorial Article yet — public
// sharing/syndication is a later phase (see analyseEditorialArticle.ts's
// header comment) — so this deliberately doesn't log a dedicated activity
// event for publish specifically, only generate/approve do.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { getSummary, publish } from "@/lib/intelligence/store";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { id } = await params;
  const existing = await getSummary("research_project", id, "editorial_article");
  if (!existing) return NextResponse.json({ error: "No Editorial Article found for this project." }, { status: 404 });
  if (existing.status !== "approved") {
    return NextResponse.json({ error: "Approve this article before publishing it." }, { status: 400 });
  }

  const saved = await publish(existing.id);
  return NextResponse.json({ data: saved });
}
