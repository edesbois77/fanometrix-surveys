// ── Stack semantic preview-frame protocol + Survey-question counter ──────────
//
// The Stack flow steps are: 0 Intro · 1 Gender · 2 Age · 3.. research questions ·
// (3 + nq) Thank You. Gender and Age are real data-collection frames but they are
// JOURNEY FURNITURE, not Survey questions — so they never contribute to the visible
// "Question X of N" counter, and N is always the Survey question count.
//
// This module is pure and framework-free so the live renderer (counter), the embed
// preview resolver, and their tests share ONE definition. It changes no data
// capture — only which step a semantic frame maps to and what the counter reads.

/** Step index of the first research question (0 Intro · 1 Gender · 2 Age · 3 Q1). */
export const STACK_RESEARCH_START = 3;

/** A semantic preview frame — what the Studio preview MEANS, independent of the
 *  Stack's numeric step (which shifts with the demographic frames and the persisted
 *  question count). `index` is the 0-based SURVEY research-question index. */
export type StackPreviewFrame =
  | { kind: "intro" }
  | { kind: "question"; index: number }
  | { kind: "thankyou" };

/** The terminal (Thank-You) step for a Stack with `nq` research questions. */
export function stackThankYouStep(nq: number): number {
  return STACK_RESEARCH_START + Math.max(0, nq);
}

/**
 * The visible "Question X of N" counter for a research question. Demographics and
 * Intro/Thank-You are never counted, so X = qi + 1 and N = the Survey question
 * count. Clamped so it can never read past the total.
 */
export function stackResearchCounter(qi: number, nq: number): { position: number; total: number } {
  const total = Math.max(0, nq);
  const position = total === 0 ? 0 : Math.min(Math.max(0, qi), total - 1) + 1;
  return { position, total };
}

/**
 * Resolve a SEMANTIC preview frame to a Stack flow step against the RENDERER'S OWN
 * question count `nq` (the persisted survey the embed loaded).
 *
 * The contract: a `question` frame ALWAYS resolves to a research step, NEVER the
 * Thank-You step. If the live Studio draft is ahead of the persisted survey
 * (index >= nq), it clamps to the newest AVAILABLE research question — a truthful
 * temporary fallback — instead of being reinterpreted as Thank You. Thank You is
 * reached only by an explicit `thankyou` frame.
 *
 * Precondition: the Stack embed only renders with nq >= 1 (a 0-question survey
 * shows a loading state), so the clamp always lands on a real research question.
 */
export function resolveStackPreviewStep(frame: StackPreviewFrame, nq: number): number {
  const n = Math.max(0, nq);
  if (frame.kind === "intro") return 0;
  if (frame.kind === "thankyou") return stackThankYouStep(n);
  if (n === 0) return STACK_RESEARCH_START; // degenerate (guarded upstream); not thankyou by intent
  const idx = Math.min(Math.max(0, Math.trunc(frame.index)), n - 1);
  return STACK_RESEARCH_START + idx;
}

/**
 * Parse the preview-only URL params into a semantic frame, or null when they are
 * not the semantic protocol (e.g. the Creative-stage static card still passes a
 * raw numeric `frame`, which the caller handles separately). `frame` is one of
 * intro | question | thankyou; `fq` is the 0-based Survey question index for a
 * question frame.
 */
export function parseStackPreviewFrame(
  frameParam: string | null,
  fqParam: string | null,
): StackPreviewFrame | null {
  if (frameParam === "intro") return { kind: "intro" };
  if (frameParam === "thankyou") return { kind: "thankyou" };
  if (frameParam === "question") {
    const idx = Number(fqParam);
    return { kind: "question", index: Number.isFinite(idx) ? Math.max(0, Math.trunc(idx)) : 0 };
  }
  return null;
}
