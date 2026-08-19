import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { allowSessionEvent } from "@/lib/embed-throttle";
import { isSurveyEventType } from "@/lib/survey-events";

// Bounds for malformed-payload rejection. Legitimate values are tiny (a session
// UUID is 36 chars; campaign slugs / publisher names are short), so these caps
// only ever reject junk or deliberately abusive bodies.
const MAX_SESSION_LEN = 64;
const MAX_FIELD_LEN = 200;
const MAX_BODY_BYTES = 4096;

// true = the value is present but malformed (reject). null/undefined pass,
// because every field except session_id/event_type is optional.
function malformedOptional(v: unknown): boolean {
  return v != null && (typeof v !== "string" || v.length > MAX_FIELD_LEN);
}

// The event vocabulary lives in lib/survey-events.ts so renderers and readers can
// never drift apart. It is additive: QUESTION_1_SHOWN, QUESTION_k_ANSWERED,
// ANSWER_SAVE_FAILED and SUBMIT_FAILED join the historical set, and SURVEY_START
// keeps its original "first answer selected" meaning.

export async function POST(req: NextRequest) {
  // Cheap size guard before parsing — a legitimate event body is a few hundred
  // bytes; anything above 4KB is junk or an abuse attempt.
  const declaredLen = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

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

  if (!session_id || typeof session_id !== "string" || session_id.length > MAX_SESSION_LEN) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }
  if (!isSurveyEventType(event_type)) {
    return NextResponse.json({ error: "Invalid event_type" }, { status: 400 });
  }
  // Reject malformed optional fields rather than persisting junk into the
  // analytics table (also blocks payload-stuffing abuse).
  if ([campaign_id, publisher, placement, placement_id, creative_id, country, device, browser].some(malformedOptional)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Best-effort per-session throttle (abuse protection; keyed by session, never
  // IP — see lib/embed-throttle.ts). A real session is far below the cap.
  if (!allowSessionEvent(session_id)) {
    return NextResponse.json({ error: "Too many events for this session" }, { status: 429 });
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
