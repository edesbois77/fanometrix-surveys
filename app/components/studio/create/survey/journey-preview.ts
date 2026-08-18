// ── Survey-journey ⇄ preview mapping (authoritative, pure, renderer-independent) ─
//
// The single source of truth for how the live Survey draft projects into the
// integrated Creative preview. Every value here derives ONLY from the current
// survey questions — never a template count, a creative-format default, a
// maximum-supported count, a cached frame array, or a stale previous count.
//
// The semantic journey is:  Intro · Question 1 · … · Question N · Thank You
// Question counters are:     Question 1 of N · … · Question N of N
// Intro and Thank You are journey FRAMES, not survey questions, so they never
// contribute to N and never carry a question counter.
//
// This module owns the mapping so SurveyStage (and its tests) have one place the
// contract lives, and so a renderer can never re-introduce an off-by-one or a
// stale/max total. It intentionally takes no Creative/renderer input: the mapping
// is identical for every Creative format — changing Creative cannot change it.

import type { Selection, PreviewFrame } from "./types";

/** The minimal question shape the journey math needs — just a stable id. */
export type JourneyQuestion = { id: string };

/**
 * The authoritative question count N for the preview. ALWAYS the live draft's
 * question count. Intro and Thank You are excluded by construction (they are not
 * in the questions array).
 */
export function journeyQuestionCount(questions: readonly JourneyQuestion[]): number {
  return questions.length;
}

/**
 * Resolve a selection against the CURRENT question list. If a previously-selected
 * question has since been removed (delete / reorder / count change), fall back to
 * the first remaining question, or the Intro when there are none — never an
 * invalid/stale id, never a dangling index.
 */
export function resolveSelection(selected: Selection, questions: readonly JourneyQuestion[]): Selection {
  if (selected.kind !== "question") return selected;
  const stillExists = questions.some((q) => q.id === selected.id);
  if (stillExists) return selected;
  return questions[0] ? { kind: "question", id: questions[0].id } : { kind: "intro" };
}

/**
 * Clamp a preview question index into the valid range [0, N-1] — the SAME formula
 * every prop renderer applies to its `previewFrame`, exposed here so the counter
 * and the renderer can never disagree. A question index can therefore never spill
 * onto the Thank-You frame.
 */
export function clampQuestionIndex(index: number, total: number): number {
  return Math.max(0, Math.min(index, Math.max(0, total - 1)));
}

/**
 * Map a selection to the preview frame the renderer should show. Question N in the
 * Journey always resolves to preview question index N-1 (the SAME survey question),
 * clamped into range. Intro and Thank You map straight through. A question
 * selection can never produce a Thank-You frame — Thank You resolves only from an
 * explicit Thank-You selection, i.e. immediately AFTER the actual final question.
 */
export function frameForSelection(selected: Selection, questions: readonly JourneyQuestion[]): PreviewFrame {
  const resolved = resolveSelection(selected, questions);
  if (resolved.kind === "intro") return { kind: "intro" };
  if (resolved.kind === "thankyou") return { kind: "thankyou" };
  const total = journeyQuestionCount(questions);
  const index = questions.findIndex((q) => q.id === resolved.id);
  return { kind: "question", index: clampQuestionIndex(Math.max(0, index), total) };
}

/**
 * The "Question X of N" counter for a frame, or null for Intro / Thank You (which
 * carry no question counter). X and N BOTH derive from the live draft, so the
 * counter is renderer-independent and can never report a template, maximum, or
 * stale total.
 */
export function previewCounter(
  frame: PreviewFrame,
  questions: readonly JourneyQuestion[],
): { position: number; total: number } | null {
  if (frame.kind !== "question") return null;
  const total = journeyQuestionCount(questions);
  if (total === 0) return null;
  const idx = clampQuestionIndex(frame.index, total);
  return { position: idx + 1, total };
}

/** Caption label for a preview frame ("Intro" · "Question 3" · "Thank You"). */
export function frameLabel(frame: PreviewFrame): string {
  if (frame.kind === "intro") return "Intro";
  if (frame.kind === "thankyou") return "Thank You";
  return `Question ${frame.index + 1}`;
}
