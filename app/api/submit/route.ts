import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalisePayload } from "@/lib/normalise";
import {
  computeStatusWithReason,
  getAcceptingStatus,
  type CampaignForStatus,
} from "@/lib/campaign-status";

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const body = normalisePayload(raw);

  const {
    campaign_id, survey_id, question_set_id,
    q1, q2, q3,
    country, fan_segment,
    publisher, placement, placement_id, creative_id,
    club, competition,
    device, browser, response_duration_seconds,
    is_demo,
    // Group + market context — populated when served via a campaign group embed
    group_id, country_code, market, survey_language,
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
    .select("id, brand_org_id, campaign_name, status, manual_status_override, start_date, end_date, target_responses, archive_after_days")
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
      console.warn(`[submit] Rejected — campaign "${campaign_id}" effective="${detail.effective}" reason="${reason}"`);
      await logAttempt({
        campaign_id: campaign_id as string, campaign_name: campaignName,
        publisher: publisher as string | null, manual_status: manualStatus,
        effective_status: detail.effective, http_code: 403,
        result: "failed", reason, is_test: !!is_demo,
      });
      return NextResponse.json({ error: msg }, { status: 403 });
    }
  }
  // If campaign not found in DB, allow submission (standalone / demo embeds without a DB record)

  // ── Insert response ────────────────────────────────────────────────────────
  const { error } = await supabase.from("responses").insert([{
    campaign_id, survey_id, question_set_id,
    q1, q2, q3,
    country, fan_segment,
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
  }]);

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
