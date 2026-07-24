// Bulk adjudication of source findings: approve a selection, or set a selection
// aside with structured feedback. The feedback is stored auditably (finding_feedback
// + finding_revisions) for the later controlled AI re-run; nothing is retrained.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { bulkApproveSourceFindings, bulkSetAsideSourceFindings } from "@/lib/analysis/source-findings/store";

const FEEDBACK_CLASSES = new Set([
  "incorrect", "weak_evidence", "duplicate", "poorly_worded",
  "not_relevant", "missing_context", "needs_more_evidence", "other",
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id: projectId } = await params;
  const body = await req.json().catch(() => ({}));

  const action = body?.action as string | undefined;
  const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string") : [];
  if (ids.length === 0) return NextResponse.json({ error: "No findings selected." }, { status: 400 });

  const actor = session.workEmail;

  if (action === "approve") {
    const moved = await bulkApproveSourceFindings(projectId, ids, actor);
    return NextResponse.json({ data: { moved }, ok: true });
  }

  if (action === "set_aside") {
    const feedbackClass = typeof body?.feedbackClass === "string" && FEEDBACK_CLASSES.has(body.feedbackClass) ? body.feedbackClass : null;
    const note = typeof body?.note === "string" ? body.note : null;
    const moved = await bulkSetAsideSourceFindings({ projectId, ids, actor, feedbackClass, note });
    return NextResponse.json({ data: { moved }, ok: true });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
