import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const VALID_TYPES = new Set([
  "SURVEY_RENDER",
  "SURVEY_START",
  "QUESTION_2_REACHED",
  "QUESTION_3_REACHED",
  "SURVEY_COMPLETED",
  "SURVEY_EXIT",
]);

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    session_id, event_type, campaign_id,
    publisher, placement, placement_id, creative_id,
    country, device, browser,
  } = body;

  if (!session_id || typeof session_id !== "string") {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }
  if (!event_type || !VALID_TYPES.has(event_type as string)) {
    return NextResponse.json({ error: "Invalid event_type" }, { status: 400 });
  }

  const { error } = await supabase.from("survey_events").insert({
    session_id,
    event_type,
    campaign_id:  campaign_id  ?? null,
    publisher:    publisher    ?? null,
    placement:    placement    ?? null,
    placement_id: placement_id ?? null,
    creative_id:  creative_id  ?? null,
    country:      country      ?? null,
    device:       device       ?? null,
    browser:      browser      ?? null,
  });

  if (error) {
    console.error("[events] Insert error:", error);
    return NextResponse.json({ error: "Failed to record event" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
