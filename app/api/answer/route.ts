import { NextRequest, NextResponse } from "next/server";
import { allowSessionEvent } from "@/lib/embed-throttle";
import { MAX_BODY_BYTES, parseAnswerRequest } from "@/lib/survey-answer-request";
import { resolveCampaignEvidenceContext } from "@/lib/survey-evidence-context";
import { persistAnswers } from "@/lib/survey-answer-store";

// Persist a single survey answer the moment it is selected — the Fanometrix evidence
// principle: an answer given is a valid data point, kept even if the respondent
// abandons later. Upserts one row per (session, question) into `response_answers`,
// which is the AUTHORITATIVE individual-answer store for 1–5 question surveys.
//
// PUBLIC, session-less by design: there is no respondent account. Reachability is
// declared in lib/public-routes.ts and enforced by middleware.ts — this route was
// unreachable (401 / 302) from the day it shipped, which is why response_answers
// stayed empty. Protection lives here instead: body-size guard, strict validation,
// a campaign existence check, and a per-session throttle.
//
// The response is meaningful: the embed checks it, retries once on a transient
// failure, and reports ANSWER_SAVE_FAILED if the answer could not be stored. A
// failed save must never again look like a success.

export async function POST(req: NextRequest) {
  const declaredLen = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = parseAnswerRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const { sessionId, campaignId, answer, client } = parsed.value;

  // Per-session throttle (abuse protection; shares the session budget with events).
  if (!allowSessionEvent(sessionId)) {
    return NextResponse.json({ error: "Too many events for this session" }, { status: 429 });
  }

  // The campaign is the attribution root. An answer against a slug that resolves to
  // nothing cannot be attributed to a survey, publisher or market, so it is refused
  // rather than stored as an orphan — the same stance /api/submit takes.
  const ctx = await resolveCampaignEvidenceContext(campaignId);
  if (!ctx) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const result = await persistAnswers([{
    sessionId,
    questionIndex: answer.questionIndex,
    answerValue: answer.answerValue,
    questionId: answer.questionId,
    canonicalQuestionKey: answer.canonicalQuestionKey,
  }], ctx, client);

  if (result.error) {
    // Logged with the identifying context so a recurrence is diagnosable from the
    // function logs alone, but never echoed to the respondent.
    console.error("[answer] Upsert failed:", {
      campaign_id: ctx.campaignId,
      survey_id: ctx.surveyId,
      question_index: answer.questionIndex,
      degraded: result.degraded,
      error: result.error,
    });
    return NextResponse.json({ error: "Failed to record answer" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, saved: result.saved });
}
