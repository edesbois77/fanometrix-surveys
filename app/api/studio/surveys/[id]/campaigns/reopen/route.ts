// ── Survey Studio → Deploy: Reopen (Ended → Draft) ────────────────────────────
// The reverse of Stop collecting. An Ended (closed) campaign returns to Draft so
// it can be edited and re-deployed for a fresh run. This is the domain "reopen"
// action (Closed → Draft); it makes ending recoverable rather than terminal.
//
// Re-deploy after reopen reuses the SAME campaign row (its deterministic slug is
// unchanged), so no slug collision — Deploy simply flips draft → live/scheduled
// again. Server-authoritative + race-safe (atomic status guard), no migration.
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

  // Only this survey's Studio ENDED (closed) campaigns are candidates.
  const { data: targets } = await supabaseAdmin
    .from("campaigns")
    .select("id")
    .in("id", ids).eq("survey_id", id).like("campaign_id", PREFIX).eq("status", "closed").is("deleted_at", null);

  const nowISO = new Date().toISOString();
  const reopened: string[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const c of (targets ?? []) as { id: string }[]) {
    // Atomic guard: still closed at commit time.
    const { data: updated, error } = await supabaseAdmin
      .from("campaigns")
      .update({ status: "draft", manual_status_override: null, status_updated_at: nowISO, updated_at: nowISO })
      .eq("id", c.id).eq("survey_id", id).eq("status", "closed").is("deleted_at", null)
      .select("id");
    if (error) { return NextResponse.json({ error: "Could not reopen the campaign." }, { status: 500 }); }
    if (!updated || updated.length === 0) { skipped.push({ id: c.id, reason: "Campaign is no longer ended." }); continue; }

    try {
      await supabaseAdmin.from("campaign_status_history").insert({
        campaign_id: c.id, old_status: "closed", new_status: "draft",
        reason: "Reopened to Draft via Survey Studio", changed_by: session.workEmail,
      });
    } catch { /* non-fatal */ }
    reopened.push(c.id);
  }

  return NextResponse.json({ campaigns: await listStudioCampaigns(id), reopened, skipped });
}
