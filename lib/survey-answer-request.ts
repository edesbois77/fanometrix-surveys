// ── Pure request validation for the survey answer paths ─────────────────────
// No DB, no HTTP — so the contract every renderer must satisfy is unit-testable.
// Shared by POST /api/answer (one answer) and POST /api/submit (the completion
// backfill), so both accept exactly the same answer shape.

export const MAX_SESSION_LEN = 64;
export const MAX_FIELD_LEN = 200;
export const MAX_BODY_BYTES = 8192;
/** Survey Studio surveys run 1–5 research questions (question_index 0–4). The
 *  optional intro frame and the goodbye/Thank-You frame are journey furniture and
 *  are NEVER questions, so they never occupy an index. */
export const MAX_QUESTIONS = 5;

export type ParsedAnswer = {
  questionIndex: number;
  answerValue: string;
  questionId: string | null;
  canonicalQuestionKey: string | null;
};

export type ParseFailure = { ok: false; status: number; error: string };
export type ParseSuccess<T> = { ok: true; value: T };
export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** response_answers.session_id / survey_events.session_id are `uuid` columns, so a
 *  non-UUID would fail at the database with an opaque 500. Reject it up front with a
 *  clear validation error the renderer can act on. */
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

function badOptionalString(v: unknown): boolean {
  return v != null && (typeof v !== "string" || v.length > MAX_FIELD_LEN);
}

function optionalString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Validate one answer (index + value + optional identity). */
export function parseAnswer(raw: unknown): ParseResult<ParsedAnswer> {
  if (raw === null || typeof raw !== "object") {
    return { ok: false, status: 400, error: "Invalid answer" };
  }
  const o = raw as Record<string, unknown>;
  // Strict: an ABSENT position must not coerce to 0 and silently become Q1.
  // Number(null) === 0, so a loose Number() cast would file an unlabelled answer
  // against the first question. Accept a number, or a numeric string.
  const rawIndex = o.question_index;
  const isNumeric = typeof rawIndex === "number"
    || (typeof rawIndex === "string" && rawIndex.trim() !== "" && Number.isFinite(Number(rawIndex)));
  const qIndex = isNumeric ? Number(rawIndex) : NaN;
  if (!Number.isInteger(qIndex) || qIndex < 0 || qIndex > MAX_QUESTIONS - 1) {
    return { ok: false, status: 400, error: "Invalid question_index" };
  }
  if (typeof o.answer_value !== "string" || o.answer_value.length === 0 || o.answer_value.length > MAX_FIELD_LEN) {
    return { ok: false, status: 400, error: "answer_value is required" };
  }
  if ([o.question_id, o.canonical_question_key].some(badOptionalString)) {
    return { ok: false, status: 400, error: "Invalid question identity" };
  }
  return {
    ok: true,
    value: {
      questionIndex: qIndex,
      answerValue: o.answer_value,
      questionId: optionalString(o.question_id),
      canonicalQuestionKey: optionalString(o.canonical_question_key),
    },
  };
}

export type ParsedAnswerRequest = {
  sessionId: string;
  campaignId: string;
  answer: ParsedAnswer;
  client: {
    country: string | null;
    fanSegment: string | null;
    market: string | null;
    placement: string | null;
    placementId: string | null;
    creativeId: string | null;
    renderer: string | null;
    isDemo: boolean;
  };
};

/** Validate a POST /api/answer body. */
export function parseAnswerRequest(body: unknown): ParseResult<ParsedAnswerRequest> {
  const o = (body ?? {}) as Record<string, unknown>;

  if (typeof o.session_id !== "string" || o.session_id.length > MAX_SESSION_LEN) {
    return { ok: false, status: 400, error: "session_id is required" };
  }
  if (!isUuid(o.session_id)) {
    return { ok: false, status: 400, error: "session_id must be a UUID" };
  }
  if (typeof o.campaign_id !== "string" || o.campaign_id.length === 0 || o.campaign_id.length > MAX_FIELD_LEN) {
    return { ok: false, status: 400, error: "campaign_id is required" };
  }

  const answer = parseAnswer(o);
  if (!answer.ok) return answer;

  const contextFields = [o.survey_id, o.country, o.fan_segment, o.market, o.placement, o.placement_id, o.creative_id, o.renderer];
  if (contextFields.some(badOptionalString)) {
    return { ok: false, status: 400, error: "Invalid payload" };
  }

  return {
    ok: true,
    value: {
      sessionId: o.session_id,
      campaignId: o.campaign_id,
      answer: answer.value,
      client: {
        country: optionalString(o.country),
        fanSegment: optionalString(o.fan_segment),
        market: optionalString(o.market),
        placement: optionalString(o.placement),
        placementId: optionalString(o.placement_id),
        creativeId: optionalString(o.creative_id),
        renderer: optionalString(o.renderer),
        isDemo: o.is_demo === true,
      },
    },
  };
}

/**
 * Validate the `answers` array carried by POST /api/submit — the completion backfill
 * that guarantees a completed survey holds every answer even when an individual
 * per-selection save was lost.
 *
 * Malformed entries are DROPPED rather than failing the submission: a completion is
 * the most valuable event in the funnel and must never be rejected over a defect in
 * an optional backfill. Duplicated indexes collapse to the last occurrence, matching
 * the (session, question) upsert key.
 */
export function parseSubmitAnswers(raw: unknown): ParsedAnswer[] {
  if (!Array.isArray(raw)) return [];
  const byIndex = new Map<number, ParsedAnswer>();
  for (const entry of raw.slice(0, MAX_QUESTIONS * 2)) {
    const parsed = parseAnswer(entry);
    if (parsed.ok) byIndex.set(parsed.value.questionIndex, parsed.value);
  }
  return [...byIndex.values()].sort((a, b) => a.questionIndex - b.questionIndex);
}
