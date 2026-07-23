// The Assertion Type × Contribution Kind compatibility matrix
// (docs/compatibility-matrix.md). The artefact that decides what Fanometrix may
// legitimately claim, and from what.
//
// A GATE, not a hint (Principle 9). Evidence that fails it is excluded from a
// claim with a stated reason and retained on the record. It is never
// down-weighted, never left to a prompt's judgement, and never decided at
// runtime: an unclear case is amended in the document first.
//
// PURE, and deliberately declarative. The whole matrix is readable in one screen
// because forty-two decisions an organisation can argue about are worth more than
// a sophisticated rule nobody can check.
import type { AssertionType, ContributionKind, Admissibility } from "@/lib/analysis/types";

/** Bumped whenever a cell changes. Findings record the version they were formed
 *  under, so a claim stays interpretable after a later revision
 *  (docs/compatibility-matrix.md §8). */
export const MATRIX_VERSION = 1;

export type Compatibility = {
  verdict: Admissibility;
  /** True where the kind is doing what it exists to establish. Distinct from
   *  admissibility, because "may be used" and "is what this is for" are
   *  different questions and collapsing them loses the second. */
  native: boolean;
  /** The prohibition or condition attached to this cell. Travels into the
   *  analyst's explanation of why evidence was excluded or limited, and into the
   *  constraint a claim is formed under. Null where the kind is unconstrained. */
  constraint: string | null;
};

const N = (constraint: string | null = null): Compatibility => ({ verdict: "admissible", native: true, constraint });
const A = (constraint: string): Compatibility => ({ verdict: "admissible", native: false, constraint });
const L = (constraint: string): Compatibility => ({ verdict: "admissible_with_limits", native: false, constraint });
const X = (constraint: string): Compatibility => ({ verdict: "inadmissible", native: false, constraint });

type Row = Record<ContributionKind, Compatibility>;

const MATRIX: Record<Exclude<AssertionType, "absence">, Row> = {
  descriptive: {
    elicited_perception:   N("Describes stated attitude, never observed behaviour."),
    unprompted_discourse:  N("Describes what was expressed, never what the wider population holds."),
    documented_activity:   N("Describes events, never their reception."),
    interested_claim:      L("Establishes only that the claim was made. The statement must attribute it."),
    expert_judgement:      L("One professional's assessment, attributed. Never the state of the world on its own."),
    established_knowledge: L("Describes what prior research found elsewhere. This engagement needs local evidence."),
  },
  comparative: {
    elicited_perception:   A("Both sides must be measured by the same instrument on comparable populations."),
    unprompted_discourse:  L("May compare what is said, never how much. Discourse volume tracks baseline salience."),
    documented_activity:   N("Compares what each party verifiably did."),
    interested_claim:      X("A party's account of itself may never ground a comparison against a rival."),
    expert_judgement:      L("Only where the named expert assessed both sides."),
    established_knowledge: L("A benchmark compares only if this engagement falls inside its population. State the population."),
  },
  magnitude: {
    elicited_perception:   N("Magnitude of stated attitude, within the sampled population, which becomes the claim's scope."),
    unprompted_discourse:  X("Conversation volume is a product of platform, window and query. It can never establish what share of a population thinks anything."),
    documented_activity:   N("Magnitude of activity, never of opinion. A count of items, never of independent sources."),
    interested_claim:      X("A party's own reach or impact figures are claims, not measurements, whatever their precision."),
    expert_judgement:      X("An informed estimate is not a measurement."),
    established_knowledge: L("May be cited as a benchmark, never restated as this engagement's measurement."),
  },
  temporal: {
    elicited_perception:   L("Requires repeated measurement with the same instrument. A single wave cannot show change."),
    unprompted_discourse:  N("Change in discourse, never change in opinion. Valid only where collection was continuous and comparable across the window."),
    documented_activity:   N("Chronology of what happened."),
    interested_claim:      X("A party's account of its own trajectory establishes only that the account was given."),
    expert_judgement:      L("An attributed reading of the trend."),
    established_knowledge: L("May establish a historical trend, never the current one."),
  },
  causal: {
    elicited_perception:   L("A self-reported reason is an attribution, not a cause. Frame it as what people say caused it."),
    unprompted_discourse:  L("People explaining themselves unprompted is still self-report."),
    documented_activity:   L("Establishes sequence, never cause."),
    interested_claim:      X("A party's claim that its own work caused an outcome is the purest form of unwarranted causal claim."),
    expert_judgement:      L("An attributed causal assessment, never presented as established."),
    established_knowledge: L("Only where the cited research design supports causal inference. A correlational study cited for a cause is inadmissible."),
  },
  predictive: {
    elicited_perception:   L("Stated intent is systematically overstated. Label it as stated intent, never as expected behaviour."),
    unprompted_discourse:  X("Discourse trends describe attention, not outcomes."),
    documented_activity:   L("An announced plan is a documented intention, not a prediction of its outcome."),
    interested_claim:      X("A party's forecast about its own work establishes only that the forecast was made."),
    expert_judgement:      L("An attributed forecast."),
    established_knowledge: L("A base rate applies only if this engagement is inside the population it was derived from."),
  },
};

/** An absence claim has no grounds by definition, so no cell can govern it. It is
 *  governed by search adequacy instead (docs/compatibility-matrix.md §7): what was
 *  examined, and whether the examination ran at all. Every kind is therefore
 *  admissible as EXAMINED material, constrained by the distinction that matters
 *  most: "we looked and found nothing" is a finding, "we never collected anything
 *  that could answer this" is an open need. */
const ABSENCE_CELL: Compatibility = {
  verdict: "admissible", native: false,
  constraint: "Counts as evidence examined, not as evidence for the claim. An absence is judged on the thoroughness of the search.",
};

export function compatibility(assertion: AssertionType, kind: ContributionKind): Compatibility {
  if (assertion === "absence") return ABSENCE_CELL;
  return MATRIX[assertion][kind];
}

export const admissibilityFor = (assertion: AssertionType, kind: ContributionKind): Admissibility =>
  compatibility(assertion, kind).verdict;

/** Whether any of these kinds is native to the assertion. A claim supported by a
 *  kind built for it is held to a lower bar than the same claim scraped together
 *  from kinds working outside their home ground (see assertionDemand relief). */
export const hasNativeKind = (assertion: AssertionType, kinds: ContributionKind[]): boolean =>
  kinds.some(k => compatibility(assertion, k).native);

// ── Combination rules (docs/compatibility-matrix.md §6) ──────────────────────
// Four rules no single cell can express, because they govern the grounds as a set.

/** §6.1 — no causal or predictive claim may rest on a single contribution kind.
 *  Every cell in those rows is at best "with limits", so a claim resting on one
 *  kind rests entirely on evidence that cannot carry it. Corroboration must cross
 *  KINDS, not merely cross sources. */
export const requiresMultipleKinds = (assertion: AssertionType): boolean =>
  assertion === "causal" || assertion === "predictive";

export type CombinationViolation = { rule: string; message: string };

/** The combination rules this assessment layer can check. §6.3 (symmetric
 *  comparative grounds) is deliberately absent: it needs to know which side of a
 *  comparison each citation supports, which is visible at warranting and not
 *  here. Enforcing it badly here would be worse than enforcing it properly
 *  there. */
export function combinationViolations(opts: {
  assertion: AssertionType;
  kinds: ContributionKind[];
  /** True when every supporting citation was admitted only with limits. */
  allWithLimits: boolean;
}): CombinationViolation[] {
  const out: CombinationViolation[] = [];

  if (requiresMultipleKinds(opts.assertion) && opts.kinds.length < 2) {
    out.push({
      rule: "6.1",
      message: `A claim of this kind cannot rest on one kind of evidence. No source can establish it alone, so corroboration has to come from a different way of knowing.`,
    });
  }

  if (opts.allWithLimits && opts.kinds.length > 0) {
    out.push({
      rule: "6.2",
      message: `Every piece of supporting evidence was admitted only with limits, and no amount of evidence that cannot carry a claim adds up to one that can.`,
    });
  }

  return out;
}
