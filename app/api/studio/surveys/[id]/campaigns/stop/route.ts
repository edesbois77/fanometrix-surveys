// ── Survey Studio → Deploy: Stop collecting (Live → Ended) ────────────────────
// The explicit end control. A running campaign — including one with NO end date
// and NO target — can always be ended here, which is otherwise impossible. It
// closes the campaign (status "closed", surfaced as "Ended"): the lazy effective-
// status engine and single-serve gate stop serving it. This is REVERSIBLE via the
// Reopen route (closed → draft), so "ended" is recoverable, not a dead end.
//
// Server-authoritative + race-safe with no migration: the transition is guarded
// ATOMICALLY by the status filter, so concurrent double-submits and a lost race
// against an auto-close both resolve to a single, truthful result.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { STUDIO_SLUG_PREFIX } from "@/lib/studio/campaign-generation";
import { listStudioCampaigns } from "@/lib/studio/campaign-list";

const PREFIX = `${STUDIO_SLUG_PREFIX}%`;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let session: AuthedUser;
  try { session = await requireUser(req, ["admin", "publisher"]); } catch { return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }

  const { data: survey } = await supabaseAdmin.from("surveys").select("id, organisation_id").eq("id", id).is("deleted_at", null).single();
  if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  if (session.role !== "admin" && (survey as { organisation_id: string | null }).organisation_id !== session.organisationId) {
    return NextResponse.json({ error: "Survey not found" }, { status: 404 }); // existence-preserving
  }

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : (body?.id ? [body.id] : []);
  if (!ids.length) return NextResponse.json({ error: "No campaigns specified." }, { status: 400 });

  // Candidates: this survey's Studio campaigns that are actively collecting
  // (Live, or Scheduled that has effectively started). Draft/closed/archived are
  // not "stoppable".
  const { data: targets } = await supabaseAdmin
    .from("campaigns")
    .select("id, status")
    .in("id", ids).eq("survey_id", id).like("campaign_id", PREFIX).in("status", ["live", "scheduled"]).is("deleted_at", null);

  const nowISO = new Date().toISOString();
  const stopped: string[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const c of (targets ?? []) as { id: string; status: string }[]) {
    // Atomic guard: still in a stoppable status at commit time.
    const { data: updated, error } = await supabaseAdmin
      .from("campaigns")
      .update({ status: "closed", manual_status_override: null, status_updated_at: nowISO, updated_at: nowISO })
      .eq("id", c.id).eq("survey_id", id).is("deleted_at", null)
      .in("status", ["live", "scheduled"])
      .select("id");
    if (error) { return NextResponse.json({ error: "Could not stop the campaign." }, { status: 500 }); }
    if (!updated || updated.length === 0) { skipped.push({ id: c.id, reason: "Campaign is no longer collecting." }); continue; }

    try {
      await supabaseAdmin.from("campaign_status_history").insert({
        campaign_id: c.id, old_status: c.status, new_status: "closed",
        reason: "Stopped collecting via Survey Studio", changed_by: session.workEmail,
      });
    } catch { /* non-fatal */ }
    stopped.push(c.id);
  }

  return NextResponse.json({ campaigns: await listStudioCampaigns(id), stopped, skipped });
}
