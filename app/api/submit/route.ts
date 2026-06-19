import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { normalisePayload } from "@/lib/normalise";
import { computeEffectiveStatus, type CampaignForStatus } from "@/lib/campaign-status";

export async function POST(req: NextRequest) {
  const raw = await req.json();
  const body = normalisePayload(raw);

  const {
    campaign_id, survey_id, question_set_id,
    q1, q2, q3,
    country, fan_segment,
    publisher, placement,
    club, competition,
    device, browser, response_duration_seconds,
  } = body as Record<string, unknown>;

  if (!campaign_id) {
    return NextResponse.json({ error: "campaign_id is required." }, { status: 400 });
  }
  if (!q1) {
    return NextResponse.json({ error: "At least one survey answer (q1) is required." }, { status: 400 });
  }

  // Look up campaign and check it is accepting responses
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, status, manual_status_override, start_date, end_date, target_responses, archive_after_days")
    .eq("campaign_id", campaign_id as string)
    .single();

  if (campaignError && campaignError.code !== "PGRST116") {
    // PGRST116 = row not found — allow submission for standalone/demo embeds
    console.error("[submit] Campaign lookup error:", campaignError);
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  if (campaign) {
    // Get current response count to check against target
    const { count } = await supabase
      .from("responses")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaign_id as string)
      .eq("is_demo", false);

    const effective = computeEffectiveStatus(
      campaign as CampaignForStatus,
      count ?? 0
    );

    if (effective !== "live") {
      const statusMessages: Record<string, string> = {
        draft:     "This survey is not currently live. The campaign is still in Draft.",
        scheduled: "This survey is not currently live. The campaign has not started yet.",
        paused:    "This survey is not currently live. The campaign is paused.",
        closed:    "This survey is not currently live. The campaign has closed.",
        archived:  "This survey is not currently live. The campaign has been archived.",
      };
      const msg = statusMessages[effective] ?? "This survey is not currently live.";
      console.warn(`[submit] Rejected — campaign "${campaign_id}" is "${effective}"`);
      return NextResponse.json({ error: msg }, { status: 403 });
    }
  }
  // If campaign not found in DB, allow submission (standalone / demo embeds without a DB record)

  const { error } = await supabase.from("responses").insert([{
    campaign_id, survey_id, question_set_id,
    q1, q2, q3,
    country, fan_segment,
    publisher, placement,
    club, competition,
    device, browser, response_duration_seconds,
  }]);

  if (error) {
    console.error("[submit] Supabase insert error:", error);
    return NextResponse.json({ error: "Failed to save response. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
