// ── Fanometrix Analytical Core — assessment signals (deterministic, pure) ─────
// Structural features read from a Finding's contracts, reused by confidence and
// materiality. Nothing here invents evidence; absent signals stay absent.

import type { Finding } from "../findings/types";
import { classifyBase, classifyCandidateDifference } from "../statistics/classify";
import { toPercentagePoints } from "../evidence/scale";
import type { BaseState, CandidateStrength, ContributionKind } from "../vocabulary";

/** Positive bases across a Finding's evidence (respondent denominators). */
export function findingBases(f: Finding): number[] {
  return f.evidence.map((e) => e.denominator ?? e.rawBase).filter((n): n is number => typeof n === "number" && n > 0);
}

/** The worst (smallest) base state across the evidence — the base that
 *  constrains the claim (Decision 1). Undefined when no base is present. */
export function worstBaseState(f: Finding): BaseState | undefined {
  const bases = findingBases(f);
  if (!bases.length) return undefined;
  return classifyBase(Math.min(...bases));
}

/** Distinct evidence contribution kinds present (canonical field). */
export function contributionKinds(f: Finding): ContributionKind[] {
  return [...new Set(f.evidence.map((e) => e.contribution).filter((c): c is ContributionKind => c != null))];
}

/** Independent supporting lines: distinct (question, observation/option) —
 *  restated/duplicated evidence is NOT counted twice (Decision 5). */
export function independentSupport(f: Finding): number {
  const keys = new Set(
    f.evidence.map((e) => `${e.question?.canonicalKey ?? ""}::${e.observationKey ?? e.option?.id ?? e.id}`),
  );
  return keys.size;
}

export const hasContesting = (f: Finding): boolean => f.evidence.some((e) => e.stance === "contests");
export const hasQualifying = (f: Finding): boolean => f.evidence.some((e) => e.stance === "qualifies");

/** Evidential distance of the claim from direct measurement (Decision 5). */
export function inferentialDistance(f: Finding): number {
  switch (f.assertionType) {
    case "descriptive":
    case "absence": return 0;
    case "comparative":
    case "magnitude":
    case "temporal": return 1;
    case "causal":
    case "predictive": return 2;
    default: return f.assertionType ? 1 : 0;
  }
}

/** How much the Finding EXPLAINS/connects, structurally (Decision 4). A synthesis
 *  across questions, a governed grouping, or a full-distribution reframe explains
 *  more than an isolated leading option. */
export function explanatoryValue(f: Finding): "high" | "moderate" | "low" {
  const crossQuestion = (f.questions?.length ?? 0) >= 2;
  const hasGrouping = (f.results ?? []).some((r) => r.operation === "grouping" || !!r.grouping);
  // HIGH explanatory value = connects or reframes: a cross-question synthesis or
  // a governed grouping. A single-question full distribution or a leading-option
  // comparison EXPLAINS one result → MODERATE. An isolated figure → LOW.
  if (crossQuestion || hasGrouping) return "high";
  const baseOptions = f.evidence.filter((e) => e.kind === "base").length;
  const fullDistribution = baseOptions >= 3;
  const hasComparison = (f.results ?? []).some((r) => r.operation === "comparison") || f.assertionType === "comparative";
  return fullDistribution || hasComparison ? "moderate" : "low";
}

/** Magnitude of a Finding's headline difference as a candidate-strength band
 *  (Decision 3) — an INPUT to materiality, never its sole determinant. Read from
 *  a comparison Result's observedDifferencePp or percentage-point quantity. */
export function magnitudeBand(f: Finding): CandidateStrength | undefined {
  for (const r of f.results ?? []) {
    if (r.operation !== "comparison") continue;
    const pp = r.statisticalAssessment?.observedDifferencePp;
    if (typeof pp === "number") return classifyCandidateDifference(Math.abs(pp));
    if (r.quantity) {
      try { return classifyCandidateDifference(Math.abs(toPercentagePoints(r.quantity))); } catch { /* not pp */ }
    }
  }
  return undefined;
}
