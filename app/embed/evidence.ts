// ── The evidence contract every production renderer must follow ─────────────
//
// ThemedSurvey, ClassicSurvey, StudioClassicSurvey and StackSurvey are four
// independent creatives, and each used to own a private copy of this plumbing. That
// is how they drifted: two checked whether the submission actually saved before
// declaring completion and two did not; all four swallowed answer failures whole,
// which is why a totally blocked /api/answer looked healthy for months.
//
// They now all call THIS module, so "what a survey records" is one testable
// definition rather than four similar ones.
//
// TERMINOLOGY: `sessionId` identifies ONE IFRAME MOUNT — a single survey attempt. It
// is not a person, a participant or a returning visitor, and nothing here writes to
// cookies or browser storage. Persistent participant identification is deliberately
// out of scope.

import { questionAnsweredEvent } from "@/lib/survey-events";

/** Which creative produced the evidence — recorded so every renderer's contract is
 *  auditable from the data alone. */
export type RendererId = "themed" | "classic" | "studio-classic" | "stack";

export type EmbedEvidenceContext = {
  /** Preview/QA impressions record nothing at all. */
  isPreview: boolean;
  /** The per-mount attempt id (a UUID). NOT a person. */
  sessionId: string;
  campaignId: string;
  surveyId: string | null;
  publisher: string | null;
  placement: string | null;
  placementId: string | null;
  creativeId: string | null;
  country: string | null;
  segment: string | null;
  market: string | null;
  device: string | null;
  browser: string | null;
  renderer: RendererId;
};

/** One answer, carrying the question's identity and not just its position. */
export type EmbedAnswer = {
  /** 0-based position among the survey's 1–5 RESEARCH questions. Intro and
   *  goodbye frames are journey furniture and never occupy an index. */
  questionIndex: number;
  answerValue: string;
  questionId: string | null;
  canonicalQuestionKey: string | null;
};

const ANSWER_ATTEMPTS = 2;      // one retry
const RETRY_DELAY_MS = 400;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Fire-and-forget beacon. Never throws, never blocks the respondent. */
export function sendEvent(ctx: EmbedEvidenceContext, eventType: string): void {
  if (ctx.isPreview) return;
  fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      session_id: ctx.sessionId,
      event_type: eventType,
      campaign_id: ctx.campaignId || null,
      publisher: ctx.publisher || null,
      placement: ctx.placement || null,
      placement_id: ctx.placementId || null,
      creative_id: ctx.creativeId || null,
      country: ctx.country || null,
      device: ctx.device || null,
      browser: ctx.browser || null,
    }),
  }).catch(() => {/* diagnostics only — never affects the respondent */});
}

function answerBody(ctx: EmbedEvidenceContext, a: EmbedAnswer) {
  return {
    session_id: ctx.sessionId,
    campaign_id: ctx.campaignId || null,
    survey_id: ctx.surveyId || null,
    question_index: a.questionIndex,
    answer_value: a.answerValue,
    question_id: a.questionId,
    canonical_question_key: a.canonicalQuestionKey,
    country: ctx.country || null,
    fan_segment: ctx.segment || null,
    market: ctx.market || null,
    placement: ctx.placement || null,
    placement_id: ctx.placementId || null,
    creative_id: ctx.creativeId || null,
    renderer: ctx.renderer,
  };
}

/**
 * Persist ONE answer at the moment it is selected.
 *
 * Retries once on a transient failure (network error, 5xx, 429) and gives up
 * immediately on a 4xx validation failure, which retrying cannot fix. The write is
 * idempotent server-side (upsert on session+question), so a retry can never inflate
 * an answer count.
 *
 * Emits ANSWER_SAVE_FAILED when the answer could not be stored — the signal whose
 * absence let a completely blocked endpoint look healthy. Returns whether it saved
 * so a renderer can surface or re-drive it; the respondent is never blocked.
 */
export async function saveAnswer(ctx: EmbedEvidenceContext, a: EmbedAnswer): Promise<boolean> {
  if (ctx.isPreview) return true;

  for (let attempt = 1; attempt <= ANSWER_ATTEMPTS; attempt++) {
    try {
      const res = await fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify(answerBody(ctx, a)),
      });
      if (res.ok) return true;

      // 4xx (except 429) is a permanent rejection — retrying sends the same body.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        console.error("[Fanometrix embed] Answer rejected:", res.status, "q", a.questionIndex);
        break;
      }
      console.warn("[Fanometrix embed] Answer save failed:", res.status, "attempt", attempt);
    } catch (err) {
      console.warn("[Fanometrix embed] Answer save error, attempt", attempt, err);
    }
    if (attempt < ANSWER_ATTEMPTS) await sleep(RETRY_DELAY_MS);
  }

  sendEvent(ctx, "ANSWER_SAVE_FAILED");
  return false;
}

/** Record an answer: the explicit answered event plus the durable answer row. */
export function recordAnswer(ctx: EmbedEvidenceContext, a: EmbedAnswer, isFirstAnswer: boolean): Promise<boolean> {
  // SURVEY_START keeps its historical meaning: the FIRST answer of the journey.
  if (isFirstAnswer) sendEvent(ctx, "SURVEY_START");
  sendEvent(ctx, questionAnsweredEvent(a.questionIndex));
  return saveAnswer(ctx, a);
}

export type SubmitOutcome = {
  /** The completed response was saved (or the campaign closed gracefully). */
  ok: boolean;
  /** A response row was actually written — the ONLY basis for SURVEY_COMPLETED. */
  recorded: boolean;
  /** Campaign hit its hard target: show the Thank You, record no completion. */
  collectionClosed: boolean;
  error: string | null;
};

/**
 * Submit the completed response.
 *
 * The `answers` array is a BACKFILL: the server re-asserts every answer into the
 * authoritative store, so a completed survey holds all of its answers even if an
 * individual per-selection save was lost to a flaky connection. It is idempotent.
 *
 * SURVEY_COMPLETED is emitted by this function and ONLY when the server confirmed
 * the response was written. Two renderers previously fired it unconditionally, so a
 * failed submit still produced a "completion".
 */
export async function submitResponse(
  ctx: EmbedEvidenceContext,
  payload: Record<string, unknown>,
  answers: EmbedAnswer[],
): Promise<SubmitOutcome> {
  if (ctx.isPreview) return { ok: true, recorded: false, collectionClosed: false, error: null };

  try {
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        session_id: ctx.sessionId,
        // The generic answer set — the only representation that can carry Q4/Q5.
        answers: answers.map((a) => ({
          question_index: a.questionIndex,
          answer_value: a.answerValue,
          question_id: a.questionId,
          canonical_question_key: a.canonicalQuestionKey,
        })),
      }),
    });

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (res.ok && json.collection_closed === true) {
      // Graceful close at a hard target: the fan finished, but nothing was recorded
      // past the ceiling — so this is NOT a completion.
      return { ok: true, recorded: false, collectionClosed: true, error: null };
    }
    if (res.ok) {
      sendEvent(ctx, "SURVEY_COMPLETED");
      return { ok: true, recorded: true, collectionClosed: false, error: null };
    }

    const error = typeof json.error === "string" ? json.error : "Something went wrong, tap an answer to try again.";
    console.error("[Fanometrix embed] Submission failed:", res.status, error);
    sendEvent(ctx, "SUBMIT_FAILED");
    return { ok: false, recorded: false, collectionClosed: false, error };
  } catch (err) {
    console.error("[Fanometrix embed] Network error on submit:", err);
    sendEvent(ctx, "SUBMIT_FAILED");
    return { ok: false, recorded: false, collectionClosed: false, error: "Network error, please check your connection and try again." };
  }
}
