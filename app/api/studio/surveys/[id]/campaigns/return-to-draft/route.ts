// ── Survey Studio → Deploy: Return to Draft (undo, → Draft) ───────────────────
// A deliberate, server-authoritative escape hatch. Two undo cases, both race-safe
// and neither needing a migration (draft/scheduled/live already exist):
//
//   1. SCHEDULED → Draft — deployed but not yet started. Guarded ATOMICALLY by
//      `status='scheduled' AND start_date > <market-local today>`: once the
//      campaign reaches its start day the boundary wins the race and it can no
//      longer be reverted.
//
//   2. LIVE → Draft, WITHIN THE GO-LIVE UNDO GRACE WINDOW — an "undo" for an
//      accidental go-live. status_updated_at is the go-live instant (Deploy sets
//      it). Guarded ATOMICALLY by `status='live' AND status_updated_at > <now −
//      grace>`. After the window the campaign is locked (it must instead be ended
//      with Stop collecting), and the guard rejects the revert.
//
// If a guard fails the campaign is left untouched and the truthful, refreshed
// status is returned in `skipped`.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { marketLocalDate } from "@/lib/campaign-time";
import { CAMPAIGN_ORIGIN } from "@/lib/campaign-groups/model";
import { STUDIO_SLUG_PREFIX } from "@/lib/studio/campaign-generation";
import { listStudioCampaigns } from "@/lib/studio/campaign-list";
import { goLiveUndoCutoffISO } from "@/lib/studio/campaign-lifecycle";


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

  // Candidates: this survey's Studio campaigns that are Scheduled OR Live (a Live
  // one is only revertible inside the go-live grace window, enforced atomically).
  const { data: targets } = await supabaseAdmin
    .from("campaigns")
    .select("id, status, start_date, country_code")
    .in("id", ids).eq("survey_id", id).eq("origin", CAMPAIGN_ORIGIN.studio).in("status", ["scheduled", "live"]).is("deleted_at", null);

  const now = new Date();
  const nowISO = now.toISOString();
  const graceCutoff = goLiveUndoCutoffISO(now);
  const reverted: string[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const c of (targets ?? []) as { id: string; status: string; start_date: string | null; country_code: string | null }[]) {
    // Two atomic guards, one per case — the DB evaluates the column comparison at
    // commit, so the market-local start boundary / grace window wins any race.
    let query = supabaseAdmin
      .from("campaigns")
      .update({ status: "draft", manual_status_override: null, status_updated_at: nowISO, updated_at: nowISO })
      .eq("id", c.id).eq("survey_id", id).is("deleted_at", null);
    let lockedReason: string;
    if (c.status === "live") {
      // Accidental-go-live undo: still Live AND it went Live within the grace window.
      query = query.eq("status", "live").gt("status_updated_at", graceCutoff);
      lockedReason = "The undo window has passed — stop collecting to end this campaign.";
    } else {
      // Scheduled: still Scheduled AND its start day is strictly in the future.
      const marketToday = marketLocalDate(c.country_code, now);
      query = query.eq("status", "scheduled").gt("start_date", marketToday);
      lockedReason = "Collection has started — cannot return to Draft.";
    }

    const { data: updated, error } = await query.select("id");
    if (error) { return NextResponse.json({ error: "Could not return campaign to Draft." }, { status: 500 }); }
    if (!updated || updated.length === 0) { skipped.push({ id: c.id, reason: lockedReason }); continue; }

    try {
      await supabaseAdmin.from("campaign_status_history").insert({
        campaign_id: c.id, old_status: c.status, new_status: "draft",
        reason: c.status === "live" ? "Undo accidental go-live via Survey Studio" : "Returned to Draft via Survey Studio",
        changed_by: session.workEmail,
      });
    } catch { /* non-fatal */ }
    reverted.push(c.id);
  }

  return NextResponse.json({ campaigns: await listStudioCampaigns(id), reverted, skipped });
}
