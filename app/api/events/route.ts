import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { allowSessionEvent } from "@/lib/embed-throttle";

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

const VALID_TYPES = new Set([
  "SURVEY_RENDER",
  "SURVEY_VISIBLE", // genuine viewport entry; start of Avg Time to First Interaction
  "SURVEY_START",
  "QUESTION_2_REACHED",
  "QUESTION_3_REACHED",
  "SURVEY_COMPLETED",
  // SURVEY_EXIT is DEPRECATED: no longer emitted by the embed (no dashboard,
  // series or report ever consumed it). Still accepted here so embed bundles
  // cached on partner ad servers before this release don't start 400ing —
  // rejecting them would not save any request and only adds error noise.
  // Rows land in survey_events but are read by nothing; prune from this set in
  // a later cleanup once caches have rolled over.
  "SURVEY_EXIT",
]);

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
  if (!event_type || typeof event_type !== "string" || !VALID_TYPES.has(event_type)) {
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
