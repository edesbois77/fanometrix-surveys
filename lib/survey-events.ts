// ── The survey event vocabulary, in one place (pure; client + server safe) ───
//
// Every renderer emits from this module and every reader resolves through it, so an
// event name can never mean two things at once.
//
// ═══ THE RULE THAT WAS BROKEN ═══
// An event name is a permanent contract with 1.1M rows of history. It may be
// DEPRECATED or JOINED BY A NEW NAME, but it must never be REDEFINED.
//
// `SURVEY_START` has meant "the respondent selected their first answer" since June
// 2026, and that is what every historical row, the metric registry ("Q1 Answered")
// and every published FedEx figure assume. The Survey Studio journey work quietly
// re-pointed it at "Q1 became active" — a much larger population — under the same
// name. That redefinition is REVERTED here: SURVEY_START keeps its original meaning,
// and the genuinely useful new signal gets its own name, QUESTION_1_SHOWN.
//
// This is safe to do now precisely because it never reached live traffic: the release
// carrying the redefinition deployed on 2026-08-18 and the last recorded event is
// 2026-08-14, so no production row was ever written under the new meaning. Nothing is
// reclassified and nothing needs backfilling.
//
// ═══ QUESTION DISPLAYED vs QUESTION ANSWERED ═══
// Historically "answered Qk" could only be INFERRED from "reached Q(k+1)", which is
// why the funnel stage names are all offset by one. Now that real answer rows exist,
// each answer emits its own QUESTION_k_ANSWERED and nothing has to be inferred.
// QUESTION_k_REACHED keeps its exact historical meaning (question k was displayed)
// so existing rows and reports stay valid.

/** Question k was DISPLAYED (1-based k). Q1 has its own name; k≥2 keeps _REACHED. */
export function questionShownEvent(questionIndex: number): string {
  return questionIndex === 0 ? "QUESTION_1_SHOWN" : `QUESTION_${questionIndex + 1}_REACHED`;
}

/** Question k was ANSWERED (0-based questionIndex). Explicit — never inferred. */
export function questionAnsweredEvent(questionIndex: number): string {
  return `QUESTION_${questionIndex + 1}_ANSWERED`;
}

export const SURVEY_EVENT_TYPES = [
  // ── Exposure ──────────────────────────────────────────────────────────────
  "SURVEY_RENDER",   // the creative loaded (one per iframe mount)
  "SURVEY_VISIBLE",  // genuine viewport entry (≥10% visible)

  // ── Survey-level intro frame (never a question) ───────────────────────────
  "INTRO_VIEWED",
  "INTRO_CONTINUED",

  // ── Question displayed ────────────────────────────────────────────────────
  // Q1 displayed. NEW name for the journey-entry signal, so SURVEY_START keeps its
  // historical meaning. Absent from all pre-2026-08 history → readers must treat a
  // missing value as UNAVAILABLE, never as zero.
  "QUESTION_1_SHOWN",
  "QUESTION_2_REACHED",
  "QUESTION_3_REACHED",
  "QUESTION_4_REACHED",
  "QUESTION_5_REACHED",

  // ── Question answered ─────────────────────────────────────────────────────
  // SURVEY_START: the FIRST answer of the journey (historical meaning, restored).
  // It is exactly QUESTION_1_ANSWERED for a survey answered in order, and is kept
  // because 1.1M historical rows and the "Q1 Answered" metric depend on it.
  "SURVEY_START",
  "QUESTION_1_ANSWERED",
  "QUESTION_2_ANSWERED",
  "QUESTION_3_ANSWERED",
  "QUESTION_4_ANSWERED",
  "QUESTION_5_ANSWERED",

  // ── Completion ────────────────────────────────────────────────────────────
  // Emitted ONLY after /api/submit has confirmed the response was saved.
  "SURVEY_COMPLETED",

  // ── Failure signals (so a silent data loss can never run for months again) ─
  "ANSWER_SAVE_FAILED",   // an individual answer could not be persisted
  "SUBMIT_FAILED",        // the completed response could not be saved

  // DEPRECATED: no longer emitted and read by nothing. Still accepted so embed
  // bundles cached on partner ad servers do not start erroring.
  "SURVEY_EXIT",
] as const;

export type SurveyEventType = (typeof SURVEY_EVENT_TYPES)[number];

const VALID = new Set<string>(SURVEY_EVENT_TYPES);

export function isSurveyEventType(v: unknown): v is SurveyEventType {
  return typeof v === "string" && VALID.has(v);
}

/**
 * Event types that are OPERATIONAL DIAGNOSTICS about delivery and progression.
 * They are never a substitute for answer evidence: an answer VALUE only ever comes
 * from `response_answers` (or, for historical surveys, `responses.q1/q2/q3`).
 */
export const DIAGNOSTIC_EVENT_TYPES = [
  "SURVEY_RENDER", "SURVEY_VISIBLE", "INTRO_VIEWED", "INTRO_CONTINUED",
  "QUESTION_1_SHOWN", "QUESTION_2_REACHED", "QUESTION_3_REACHED",
  "QUESTION_4_REACHED", "QUESTION_5_REACHED",
  "ANSWER_SAVE_FAILED", "SUBMIT_FAILED", "SURVEY_EXIT",
] as const;
