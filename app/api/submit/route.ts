import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { normalisePayload } from "@/lib/normalise";

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
