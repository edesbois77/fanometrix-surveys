import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalisePayload } from "@/lib/normalise";
import {
  computeStatusWithReason,
  getAcceptingStatus,
  type CampaignForStatus,
} from "@/lib/campaign-status";
import { checkResearchTargetReached } from "@/lib/research-project-target-check";

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const body = normalisePayload(raw);

  const {
    campaign_id, survey_id, question_set_id,
    // Phase 3: the embed session id (also sent to /api/answer + /api/events). Stored
    // so a completed response can be joined to response_answers for Q4/Q5 in
    // 4–5-question surveys. Absent from older cached embeds → stored NULL (no change
    // for existing 1–3-question campaigns, whose answers all live in q1/q2/q3).
    session_id,
    q1, q2, q3,
    country, fan_segment,
    publisher, placement, placement_id, creative_id,
    club, competition,
    device, browser, response_duration_seconds,
    is_demo,
    // Group + market context — populated when served via a campaign group embed
    group_id, country_code, market, survey_language,
    // Demographic answers — asked explicitly by the Stack creative's Gender/Age
    // frames and stored as dimensions on the response (columns exist since
    // migration 002). Absent for creatives that don't ask them (Classic/Timer).
    gender, age,
  } = body as Record<string, unknown>;

  if (!campaign_id) {
    return NextResponse.json({ error: "campaign_id is required." }, { status: 400 });
  }
  if (!q1) {
    return NextResponse.json({ error: "At least one survey answer (q1) is required." }, { status: 400 });
  }

  // ── Look up campaign ────────────────────────────────────────────────────────
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, research_project_id, survey_id, brand_org_id, campaign_name, status, manual_status_override, start_date, end_date, target_responses, target_mode, archive_after_days, country_code, is_simulated")
    .eq("campaign_id", campaign_id as string)
    .single();

  // organisations has deny_all_anon RLS, so this lookup uses supabaseAdmin
  // even though the rest of this public route uses the anon client.
  let brandName = "";
  if (campaign?.brand_org_id) {
    const { data: brandOrg } = await supabaseAdmin.from("organisations").select("name").eq("id", campaign.brand_org_id).single();
    brandName = brandOrg?.name ?? "";
  }

  const campaignName = campaign
    ? `${brandName} – ${campaign.campaign_name}`
    : String(campaign_id);

  const manualStatus = campaign?.status ?? null;

  // PGRST116 = row not found; anything else is a real DB error
  if (campaignError && campaignError.code !== "PGRST116") {
    console.error("[submit] Campaign lookup error:", campaignError);
    await logAttempt({
      campaign_id: campaign_id as string, campaign_name: campaignName,
      publisher: publisher as string | null, manual_status: null,
      effective_status: "unknown", http_code: 500,
      result: "failed", reason: "Database error looking up campaign",
      is_test: !!is_demo,
    });
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  // This endpoint is the real-respondent submission pipeline only.
  // Every campaign_id must resolve to a real campaigns row — an
  // unregistered slug used to be accepted here as a "standalone/demo
  // embed" fallback; that fallback is what let synthetic/test data
  // accumulate as unattributed rows with no owning campaign, so it's
  // closed rather than preserved.
  if (!campaign) {
    console.warn(`[submit] Rejected, campaign_id "${campaign_id}" does not resolve to a known campaign`);
    await logAttempt({
      campaign_id: campaign_id as string, campaign_name: campaignName,
      publisher: publisher as string | null, manual_status: null,
      effective_status: "unknown", http_code: 404,
      result: "failed", reason: "Campaign not found", is_test: !!is_demo,
    });
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  // Simulated campaigns only ever receive evidence from the Simulation
  // engine's own generation routes — never from this public,
  // real-respondent endpoint. This is the API-level half of the
  // guarantee; migration 084's database trigger is the other half.
  if (campaign.is_simulated) {
    console.warn(`[submit] Rejected, campaign "${campaign_id}" is simulated and cannot accept real submissions`);
    await logAttempt({
      campaign_id: campaign_id as string, campaign_name: campaignName,
      publisher: publisher as string | null, manual_status: manualStatus,
      effective_status: "unknown", http_code: 403,
      result: "failed", reason: "Campaign is simulated", is_test: !!is_demo,
    });
    return NextResponse.json({ error: "This campaign belongs to a simulated research project and cannot accept real submissions." }, { status: 403 });
  }

  // ── Status check ────────────────────────────────────────────────────────────
  let effectiveStatus = "unknown";

  if (campaign) {
    const { count } = await supabase
      .from("responses")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaign_id as string)
      .eq("is_demo", false);

    const detail = computeStatusWithReason(campaign as CampaignForStatus, count ?? 0);
    effectiveStatus = detail.effective;

    const { accepting, reason } = getAcceptingStatus(campaign as CampaignForStatus, count ?? 0);

    if (!accepting) {
      // Graceful close for a reached hard ceiling (stop mode, at/over target). The
      // fan finished the survey; return 200 so EVERY renderer shows the Thank You
      // rather than a "tap to retry" error (StudioClassic/Classic key on res.ok),
      // and record nothing beyond the target. Their partial answers in
      // response_answers are retained independently. This also covers the read-time
      // already-over case; the atomic insert guard below covers the live race.
      if (
        campaign.target_mode !== "continue" &&
        campaign.target_responses != null &&
        (count ?? 0) >= (campaign.target_responses as number)
      ) {
        await logAttempt({
          campaign_id: campaign_id as string, campaign_name: campaignName,
          publisher: publisher as string | null, manual_status: manualStatus,
          effective_status: detail.effective, http_code: 200,
          result: "failed", reason: "Target ceiling reached (graceful close)", is_test: !!is_demo,
        });
        return NextResponse.json({ recorded: false, collection_closed: true }, { status: 200 });
      }

      const statusMessages: Record<string, string> = {
        "Campaign is Draft":           "This survey is not currently live. The campaign is still in Draft.",
        "Campaign is Scheduled":       "This survey is not currently live. The campaign has not started yet.",
        "Campaign is Paused":          "This survey is not currently live. The campaign is paused.",
        "Campaign is Closed":          "This survey is not currently live. The campaign has closed.",
        "Campaign is Archived":        "This survey is not currently live. The campaign has been archived.",
        "End Date Reached":            "This survey is not currently live. The campaign end date has passed.",
        "Target Responses Reached":    "This survey is not currently live. The campaign has reached its response target.",
      };
      const msg = statusMessages[reason] ?? "This survey is not currently live.";
      console.warn(`[submit] Rejected, campaign "${campaign_id}" effective="${detail.effective}" reason="${reason}"`);
      await logAttempt({
        campaign_id: campaign_id as string, campaign_name: campaignName,
        publisher: publisher as string | null, manual_status: manualStatus,
        effective_status: detail.effective, http_code: 403,
        result: "failed", reason, is_test: !!is_demo,
      });
      return NextResponse.json({ error: msg }, { status: 403 });
    }
  }

  // ── Resolve the effective survey ────────────────────────────────────────────
  // Attribute every response to its survey server-side, so vw_survey_stats (and
  // Survey Intelligence's readiness gate, which reads it) count correctly. The
  // campaign is authoritative: its own survey_id, or — when it inherits the
  // survey from its research project (survey_id NULL) — the project's survey_id,
  // mirroring the embed/campaign resolution. Only fall back to the client-sent
  // survey_id if the campaign resolves to nothing. research_projects has
  // deny_all_anon RLS, so the lookup uses supabaseAdmin.
  let effectiveSurveyId = (campaign.survey_id as string | null) ?? null;
  if (!effectiveSurveyId && campaign.research_project_id) {
    const { data: proj } = await supabaseAdmin
      .from("research_projects")
      .select("survey_id")
      .eq("id", campaign.research_project_id)
      .single();
    effectiveSurveyId = proj?.survey_id ?? null;
  }
  effectiveSurveyId = effectiveSurveyId ?? (survey_id as string | null) ?? null;

  // ── Insert response ────────────────────────────────────────────────────────
  const row: Record<string, unknown> = {
    campaign_id, survey_id: effectiveSurveyId, question_set_id,
    session_id:      (session_id as string | null) ?? null,
    q1, q2, q3,
    country, fan_segment,
    // Explicitly-asked demographics (Stack Gender/Age). Null for creatives that
    // don't collect them, so existing campaigns are unaffected.
    gender:          (gender as string | null) ?? null,
    age_band:        (age    as string | null) ?? null,
    publisher, placement,
    placement_id:    placement_id    ?? null,
    creative_id:     creative_id     ?? null,
    club, competition,
    device, browser, response_duration_seconds,
    is_demo: !!is_demo,
    // Group + market context (null for single-campaign embeds)
    group_id:        group_id        ?? null,
    country_code:    country_code    ?? null,
    market:          market          ?? null,
    survey_language: survey_language ?? null,
  };

  // A stop-mode campaign with a target has a HARD ceiling: route its inserts through
  // the atomic guard (migration 187) so concurrent completions can never overshoot
  // the target (no N+1). Every other campaign — no target, continue-mode, demo, and
  // ALL historical / fan-invitation traffic — keeps the plain insert, byte-for-byte
  // unchanged, so this cannot alter their behaviour.
  const enforceCeiling =
    campaign.target_mode !== "continue" && campaign.target_responses != null && !is_demo;

  if (enforceCeiling) {
    // jsonb_populate_record would NULL the defaulted id/created_at, so supply them.
    const payload = { ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    const { data: outcome, error: rpcError } = await supabase.rpc(
      "fx_submit_response_if_under_ceiling",
      { p_campaign_id: campaign_id as string, p_target: campaign.target_responses as number, p_payload: payload }
    );
    if (rpcError) {
      console.error("[submit] Atomic ceiling RPC error:", rpcError);
      await logAttempt({
        campaign_id: campaign_id as string, campaign_name: campaignName,
        publisher: publisher as string | null, manual_status: manualStatus,
        effective_status: effectiveStatus, http_code: 500,
        result: "failed", reason: "Database insert failed", is_test: !!is_demo,
      });
      return NextResponse.json({ error: "Failed to save response. Please try again." }, { status: 500 });
    }
    if (outcome === "ceiling_reached") {
      // Lost the race: the campaign just hit its target. Graceful close (200) —
      // the fan sees the Thank You, nothing is recorded past the ceiling, and any
      // partial answers already in response_answers are retained.
      await logAttempt({
        campaign_id: campaign_id as string, campaign_name: campaignName,
        publisher: publisher as string | null, manual_status: manualStatus,
        effective_status: effectiveStatus, http_code: 200,
        result: "failed", reason: "Target ceiling reached (graceful close)", is_test: !!is_demo,
      });
      return NextResponse.json({ recorded: false, collection_closed: true }, { status: 200 });
    }
    // outcome === "inserted" → fall through to the success path.
  } else {
    const { error } = await supabase.from("responses").insert([row]);
    if (error) {
      console.error("[submit] Supabase insert error:", error);
      await logAttempt({
        campaign_id: campaign_id as string, campaign_name: campaignName,
        publisher: publisher as string | null, manual_status: manualStatus,
        effective_status: effectiveStatus, http_code: 500,
        result: "failed", reason: "Database insert failed", is_test: !!is_demo,
      });
      return NextResponse.json({ error: "Failed to save response. Please try again." }, { status: 500 });
    }
  }

  // Research Target check — best-effort, never fails the submission itself.
  // See lib/research-project-target-check.ts: reading data must never
  // mutate it, so this runs from the write path (a response landing),
  // not from any GET route.
  if (campaign?.research_project_id && !is_demo) {
    try {
      await checkResearchTargetReached(campaign.id);
    } catch (err) {
      console.error("[submit] Research target check failed:", err);
    }
  }

  await logAttempt({
    campaign_id: campaign_id as string, campaign_name: campaignName,
    publisher: publisher as string | null, manual_status: manualStatus,
    effective_status: effectiveStatus, http_code: 200,
    result: "success", reason: "Saved", is_test: !!is_demo,
  });

  return NextResponse.json({ success: true });
}

// ── Submission log helper ──────────────────────────────────────────────────────

type LogEntry = {
  campaign_id:       string;
  campaign_name:     string;
  publisher:         string | null;
  manual_status:     string | null;
  effective_status:  string;
  http_code:         number;
  result:            "success" | "failed";
  reason:            string | null;
  is_test:           boolean;
};

async function logAttempt(entry: LogEntry) {
  try {
    await supabaseAdmin.from("submission_logs").insert(entry);
  } catch {
    // Non-fatal — don't let logging failure break the submission response
  }
}
