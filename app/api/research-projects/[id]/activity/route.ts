// A single, narrow write path for activity entries that don't have a
// natural home in another route's own handler — specifically, bulk
// campaign actions run from the Workspace's embedded Campaigns manager
// (useCampaignBulkActions), which loop over per-campaign endpoints
// client-side and need exactly one aggregated log line per batch (e.g.
// "24 campaign(s) published.") rather than one line per campaign.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { canAccess } from "@/lib/access";
import { logActivity } from "@/lib/research-project-activity";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser(req, ["admin", "publisher"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;

  if (session.role !== "admin" && !(await canAccess(session, "research_project", id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { message } = await req.json();
  if (!message?.trim()) {
    return NextResponse.json({ error: "message is required." }, { status: 400 });
  }

  await logActivity(id, "project_updated", message.trim(), session.workEmail);

  return NextResponse.json({ success: true });
}
