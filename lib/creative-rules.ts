// ── Creative rules model (Survey Studio Create Phase 2) ──────────────────────
// A Creative defines the allowable structure/interaction rules; a Survey uses
// whichever permitted structure the selected Creative allows. This is the read
// side of `creative_designs.rules` (migration 180) with a safe fallback: when a
// Creative has NO rules (null — e.g. a not-yet-seeded or future custom design),
// limits fall back to the global SURVEY_LIMITS so it behaves EXACTLY as today.
//
// V1 is deliberately the 7 fields only — no asset/auto-advance machinery, no
// question-type field (single choice only in V1). 4–5 question behaviour is NOT
// enabled here (built-ins are seeded maxQuestions=3); that is Phase 6.

import { SURVEY_LIMITS } from "@/lib/survey-validation";

export type CreativeLayout = "timer" | "classic" | "invitation" | "stack";

export interface CreativeRules {
  introSupported: boolean;
  minQuestions: number;
  maxQuestions: number;
  thankYouSupported: boolean;
  maxOptions: number;
  maxQChars: number;
  maxOptChars: number;
}

/**
 * Resolve a Creative's structure rules from its `rules` jsonb, falling back to
 * the global SURVEY_LIMITS for any missing field. `layout` informs the
 * `introSupported` fallback only (invitation/stack show an intro today), so a
 * null-rules Creative matches its current behaviour exactly.
 */
export function resolveCreativeRules(rules: unknown, layout?: CreativeLayout | null): CreativeRules {
  const r = rules && typeof rules === "object" ? (rules as Record<string, unknown>) : null;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const introFallback = layout === "invitation" || layout === "stack";
  return {
    introSupported: bool(r?.introSupported, introFallback),
    minQuestions: num(r?.minQuestions, 1),
    maxQuestions: num(r?.maxQuestions, SURVEY_LIMITS.MAX_QUESTIONS),
    thankYouSupported: bool(r?.thankYouSupported, true),
    maxOptions: num(r?.maxOptions, SURVEY_LIMITS.MAX_OPTIONS),
    maxQChars: num(r?.maxQChars, SURVEY_LIMITS.MAX_Q_CHARS),
    maxOptChars: num(r?.maxOptChars, SURVEY_LIMITS.MAX_OPT_CHARS),
  };
}

// NOTE: a previous "capability summary" (Intro supported / 1–3 questions / Thank
// You supported) was removed — those are SURVEY-JOURNEY concerns (Survey stage),
// not Creative-type characteristics, and must not appear on the Creative cards.
// `rules` now feeds only the genuine RENDERER constraints (maxOptions/maxQChars/
// maxOptChars) used by the compatibility check.
