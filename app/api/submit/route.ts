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

  if (!campaign_id || !q1) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Check campaign exists and is accepting responses
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("status, manual_status_override, start_date, end_date, target_responses, archive_after_days")
    .eq("campaign_id", campaign_id as string)
    .single();

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
      return NextResponse.json(
        { error: "This survey is not currently accepting responses." },
        { status: 403 }
      );
    }
  }
  // If campaign not found, allow submission (standalone embeds without a campaign record)

  const { error } = await supabase.from("responses").insert([{
    campaign_id, survey_id, question_set_id,
    q1, q2, q3,
    country, fan_segment,
    publisher, placement,
    club, competition,
    device, browser, response_duration_seconds,
  }]);

  if (error) {
    console.error("Supabase insert error:", error);
    return NextResponse.json({ error: "Failed to save response" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
