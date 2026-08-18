// ── Survey Studio — Finding domain (pure) ────────────────────────────────────
// A Studio Finding is a Fanometrix-curated result. This module owns the PURE
// rules: who may curate, the canonical provenance + analytical snapshot derived
// from a SERVER-RESOLVED result (never client numbers), the editorial-only patch,
// and the list-card projection. No DB, no maths duplication — snapshots are built
// from an already-resolved QuestionResult (see lib/studio/survey-results-resolve).

import type { QuestionResult } from "@/lib/studio/survey-results";
import type { ResultsFilters } from "@/lib/studio/survey-results";

// ── Curation access — Fanometrix (admin/operator) only (V1) ──────────────────
// Per the Blueprint, Create Finding is a Fanometrix action. Publishers/clients do
// not curate in Manage V1 (they consume via Discover later). This is ON TOP of
// Manage ownership (canManageSurvey) — both must hold.
export function canCurateFindings(principal: { role: string }): boolean {
  return principal.role === "admin";
}

// ── Canonical provenance (system-controlled) ─────────────────────────────────
export type FindingSourceIdentity = {
  questionIndex: number;
  optionId: string;
  filters: ResultsFilters;
  displayLanguage: string;
};

/** Normalise the active filters to the four governed keys only (drop anything else). */
export function cleanFilters(f: unknown): ResultsFilters {
  const o = (f ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return { publisher: s(o.publisher), market: s(o.market), campaign: s(o.campaign), language: s(o.language) };
}

// ── Analytical snapshot (from a server-resolved result) ──────────────────────
export type FindingSnapshot = {
  questionId: string;
  base_n: number;
  answer_count: number;
  percentage: number | null;
  shown: number | null;         // null = unavailable (historical), persisted as null (not 0)
  answered: number;
  question_completion: number | null;
  snapshot: {
    questionText: string;
    optionId: string;
    optionLabel: string;
    displayLanguage: string;
    options: { optionId: string; label: string; count: number; percentage: number | null }[];
  };
};

export type SnapshotError = { error: "question_not_found" | "option_not_found" | "zero_base" };

/**
 * Build the finding snapshot for a specific answer option from the SERVER-RESOLVED
 * question results. Fails safely for an invalid question/option (deleted since) and
 * refuses a zero-base result (no valid answers → a "0% / n=0" statement would mislead).
 * All numbers come from the resolved result — never from the browser.
 */
export function buildAnswerFindingSnapshot(
  questions: QuestionResult[],
  identity: { questionIndex: number; optionId: string; displayLanguage: string },
): FindingSnapshot | SnapshotError {
  const q = questions[identity.questionIndex];
  if (!q || q.questionIndex !== identity.questionIndex) return { error: "question_not_found" };
  const opt = q.options.find((o) => o.optionId === identity.optionId);
  if (!opt) return { error: "option_not_found" };
  if (q.base <= 0) return { error: "zero_base" };
  return {
    questionId: q.questionId,
    base_n: q.base,
    answer_count: opt.count,
    percentage: opt.percentage,
    shown: q.shown,
    answered: q.answered,
    question_completion: q.completionRate,
    snapshot: {
      questionText: q.text,
      optionId: opt.optionId,
      optionLabel: opt.label,
      displayLanguage: identity.displayLanguage,
      options: q.options.map((o) => ({ optionId: o.optionId, label: o.label, count: o.count, percentage: o.percentage })),
    },
  };
}

export function isSnapshotError(v: FindingSnapshot | SnapshotError): v is SnapshotError {
  return (v as SnapshotError).error !== undefined;
}

// ── Editorial (Fanometrix-controlled) ────────────────────────────────────────
/** Validate/trim the editorial input for CREATE. Headline is required. */
export function validateEditorial(input: { headline?: unknown; commentary?: unknown }): { headline: string; commentary: string | null } | { error: string } {
  const headline = typeof input.headline === "string" ? input.headline.trim() : "";
  if (!headline) return { error: "A headline is required." };
  const commentary = typeof input.commentary === "string" && input.commentary.trim() ? input.commentary.trim() : null;
  return { headline, commentary };
}

/**
 * The ONLY fields an editorial PATCH may change. Analytical provenance/snapshot is
 * never touched through this path — changing the source requires a new Finding.
 */
export function editorialPatch(input: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (typeof input.headline === "string" && input.headline.trim()) patch.headline = input.headline.trim();
  if ("commentary" in input) patch.commentary = typeof input.commentary === "string" && input.commentary.trim() ? input.commentary.trim() : null;
  return patch;
}

/** Fields a client may NEVER set on a Finding (provenance + snapshot + lifecycle). */
export const PROTECTED_FINDING_FIELDS = [
  "id", "survey_id", "source_type", "question_index", "question_id", "option_id", "filters", "display_language",
  "base_n", "answer_count", "percentage", "shown", "answered", "question_completion", "snapshot",
  "status", "created_by", "created_at", "updated_by", "updated_at", "published_by", "published_at",
] as const;

// ── List-card projection ─────────────────────────────────────────────────────
export type FindingRow = {
  id: string; survey_id: string; status: string; headline: string; commentary: string | null;
  source_type: string; question_index: number; question_id: string; option_id: string; filters: ResultsFilters;
  display_language: string | null; base_n: number; answer_count: number | null; percentage: number | null;
  shown: number | null; answered: number | null; question_completion: number | null; snapshot: Record<string, unknown> | null;
  created_at: string; published_at: string | null; published_by: string | null; created_by: string | null;
};

export type FindingCard = {
  id: string; status: string; headline: string;
  questionIndex: number; optionLabel: string; percentage: number | null; baseN: number;
  filters: ResultsFilters; createdAt: string; publishedAt: string | null;
};

export function findingCard(row: FindingRow): FindingCard {
  const snap = (row.snapshot ?? {}) as { optionLabel?: string };
  return {
    id: row.id,
    status: row.status,
    headline: row.headline,
    questionIndex: row.question_index,
    optionLabel: snap.optionLabel ?? row.option_id,
    percentage: row.percentage,
    baseN: row.base_n,
    filters: row.filters ?? {},
    createdAt: row.created_at,
    publishedAt: row.published_at,
  };
}
