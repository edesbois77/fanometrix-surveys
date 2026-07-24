import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { allowSessionEvent } from "@/lib/embed-throttle";

// Persist a single survey answer the moment it is selected — the Fanometrix
// evidence principle: an answer given is a valid data point, kept even if the
// respondent abandons later. Upserts one row per (session, question) into
// response_answers via the service role (server-only write). `responses` and the
// completion flow are untouched; this runs ALONGSIDE them.
//
// Mirrors /api/events for validation, size guard and per-session throttle.
const MAX_SESSION_LEN = 64;
const MAX_FIELD_LEN = 200;
const MAX_BODY_BYTES = 4096;

function malformedOptional(v: unknown): boolean {
  return v != null && (typeof v !== "string" || v.length > MAX_FIELD_LEN);
}

export async function POST(req: NextRequest) {
  const declaredLen = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { session_id, campaign_id, survey_id, question_index, answer_value, country, fan_segment, market } = body;

  if (!session_id || typeof session_id !== "string" || session_id.length > MAX_SESSION_LEN) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }
  if (!campaign_id || typeof campaign_id !== "string" || campaign_id.length > MAX_FIELD_LEN) {
    return NextResponse.json({ error: "campaign_id is required" }, { status: 400 });
  }
  const qIndex = Number(question_index);
  if (!Number.isInteger(qIndex) || qIndex < 0 || qIndex > 2) {
    return NextResponse.json({ error: "Invalid question_index" }, { status: 400 });
  }
  if (typeof answer_value !== "string" || answer_value.length === 0 || answer_value.length > MAX_FIELD_LEN) {
    return NextResponse.json({ error: "answer_value is required" }, { status: 400 });
  }
  if ([survey_id, country, fan_segment, market].some(malformedOptional)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Per-session throttle (abuse protection; shares the session budget with events).
  if (!allowSessionEvent(session_id)) {
    return NextResponse.json({ error: "Too many events for this session" }, { status: 429 });
  }

  const { error } = await supabaseAdmin
    .from("response_answers")
    .upsert({
      session_id,
      campaign_id,
      survey_id:      (survey_id      as string | null) ?? null,
      question_index: qIndex,
      answer_value,
      country:        (country        as string | null) ?? null,
      fan_segment:    (fan_segment    as string | null) ?? null,
      market:         (market         as string | null) ?? null,
      updated_at:     new Date().toISOString(),
    }, { onConflict: "session_id,question_index" });

  if (error) {
    console.error("[answer] Upsert error:", error);
    return NextResponse.json({ error: "Failed to record answer" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
