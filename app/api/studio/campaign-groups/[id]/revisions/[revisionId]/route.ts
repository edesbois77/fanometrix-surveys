// ── Cancelling a scheduled configuration ─────────────────────────────────────
// Only a PENDING revision can be cancelled. One that has already taken effect
// was eligible to govern serves, so withdrawing it would misrepresent what was
// configured at the time; it is superseded by a new revision instead. The
// database enforces this (migration 212) — this route states it in the UI's
// language and never assumes the check succeeded.

import { NextRequest, NextResponse } from "next/server";
import { campaignGroupsStudioEnabled, DISABLED_RESPONSE } from "@/lib/campaign-groups/flag";
import { requireUser } from "@/lib/auth-server";
import { loadStudioGroupById, loadRevisions, cancelRevision } from "@/lib/campaign-groups/store";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; revisionId: string }> },
) {
  // Rollout gate — before auth, so a disabled route is indistinguishable from
  // one that does not exist rather than revealing itself through a 401/403.
  if (!campaignGroupsStudioEnabled()) {
    return NextResponse.json(DISABLED_RESPONSE, { status: 404 });
  }

  let session;
  try { session = await requireUser(req); } catch (err) { return err as Response; }
  const { id, revisionId } = await params;

  const group = await loadStudioGroupById(id);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  if (session.role !== "admin" && group.organisationId !== session.organisationId) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  // The revision must belong to THIS group. Without this check the route would
  // cancel any revision id the caller could name, in any organisation, because
  // the RPC itself is keyed only on the revision.
  const revisions = await loadRevisions(group.id);
  const target = revisions.find(r => r.id === revisionId);
  if (!target) return NextResponse.json({ error: "Revision not found" }, { status: 404 });

  if (target.cancelledAt) {
    return NextResponse.json({ error: "That configuration was already cancelled." }, { status: 409 });
  }
  if (target.effectiveAt <= new Date()) {
    return NextResponse.json(
      { error: "This configuration has already taken effect and cannot be cancelled. Publish a new configuration to replace it." },
      { status: 409 },
    );
  }

  const result = await cancelRevision(revisionId, session.workEmail ?? session.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Could not cancel the configuration." }, { status: 409 });
  }
  return NextResponse.json({ cancelled: true });
}
