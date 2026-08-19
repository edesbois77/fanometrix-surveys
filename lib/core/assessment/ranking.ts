// ── Fanometrix Analytical Core — ranking (Stage 3, Decision 9) ────────────────
// Assigns priority CLASSES (no numeric score). Only eligible Findings compete.
// Ineligible → suppressed regardless of how interesting they sound. Redundant
// Findings become supporting/suppressed. Materiality + relevance + confidence +
// explanatory value decide the class; magnitude never buys prominence alone.

import type { Finding } from "../findings/types";
import type {
  EligibilityAssessment, ConfidenceAssessment, MaterialityAssessment, RelevanceAssessment,
  RedundancyAssessment, Priority,
} from "./types";
import { AUTHORITY_CEILING } from "../semantic/authority";
import { constructAuthorityOf } from "../semantic/interpretation";

export type RankingInput = {
  eligibility: EligibilityAssessment;
  confidence: ConfidenceAssessment;
  materiality: MaterialityAssessment;
  relevance: RelevanceAssessment;
  redundancy: RedundancyAssessment;
  /** The Finding, for structured ranking constraints (temporal comparability,
   *  synthesis relationship). Optional so unit tests can omit it. */
  finding?: Finding;
};

export const PRIORITY_ORDER: Record<Priority, number> = { primary: 0, secondary: 1, contextual: 2, suppressed: 3 };
const AT: Record<number, Priority> = { 0: "primary", 1: "secondary", 2: "contextual", 3: "suppressed" };

/** True when a Finding depends on a cross-wave/time comparison whose governed
 *  comparability is NOT established (Decision 6). Structured — read from
 *  finding.change, never inferred from wording. */
export function temporalComparabilityUnresolved(f?: Finding): boolean {
  if (!f?.change) return false;
  return f.change.state !== "comparable_change" && f.change.state !== "trend";
}

export function assignPriority(a: RankingInput): { priority: Priority; reasons: string[] } {
  const reasons: string[] = [];
  const { eligibility, confidence, materiality, relevance, redundancy } = a;

  if (eligibility.level === "ineligible") return { priority: "suppressed", reasons: [`ineligible: ${eligibility.governanceIssueIds.join(", ")}`] };
  if (eligibility.level === "unable_to_assess") return { priority: "contextual", reasons: ["cannot be assessed — held as context"] };

  const overstated = eligibility.caveats.some((c) => /overstated_leadership/i.test(c));
  const severeBase = eligibility.caveats.some((c) => /below the reportable minimum/i.test(c));

  // Construct-authority ceiling (Standard v1.2 §36/§44, Stage 5R.1): a NOVEL
  // quantitative interpretation whose meaning rests only on model judgement is
  // PROVISIONAL and can never be a headline. Capped at Contextual BEFORE
  // redundancy/materiality — so no later signal (magnitude, confidence, base,
  // significance, relevance) can lift it, and so an invalid relabel is never
  // treated as "supporting" a real Finding. NOT suppressed: exploratory
  // intelligence is retained. Authority is STRUCTURED metadata, never inferred
  // from construct-label wording — that string-coupling was the Stage 5 leak.
  const authority = constructAuthorityOf(a.finding);
  if (authority && AUTHORITY_CEILING[authority] === "contextual") {
    return { priority: "contextual", reasons: ["construct_authority_provisional", "capped_at_contextual_pending_independent_validation"] };
  }

  // Redundancy: the weaker restatement of a stronger story becomes supporting
  // context (or is suppressed if it is minor or an overstatement).
  if (redundancy.subsumedBy) {
    if (materiality.level === "low" || overstated) return { priority: "suppressed", reasons: [`subsumed by ${redundancy.subsumedBy}${overstated ? " and overstated" : ""}`] };
    return { priority: "contextual", reasons: [`supports ${redundancy.subsumedBy} (same story, kept as context)`] };
  }

  const matHigh = materiality.level === "critical" || materiality.level === "high";
  const confOk = confidence.level === "high" || confidence.level === "moderate";
  const relHigh = relevance.level === "high";

  let priority: Priority;
  if (matHigh && confOk && relHigh && !severeBase) { reasons.push("high materiality, supported by adequate evidence, central to the objective"); priority = "primary"; }
  else if (matHigh && confOk) { reasons.push("high materiality but not clearly central / capped by evidence limits"); priority = "secondary"; }
  else if (materiality.level === "moderate" && (relHigh || confOk)) { reasons.push("moderate materiality"); priority = "secondary"; }
  else if (materiality.level === "low") { reasons.push("low materiality — retained as context"); priority = "contextual"; }
  else { reasons.push("insufficient materiality/support for prominence"); priority = "contextual"; }

  // Temporal-comparability cap (Stage 3.1 / Decision 6): an interesting wave/time
  // difference cannot rank above contextual until governed comparability exists.
  if (temporalComparabilityUnresolved(a.finding) && PRIORITY_ORDER[priority] < PRIORITY_ORDER.contextual) {
    reasons.push("temporal_comparability_unresolved", "priority_capped_by_unresolved_comparability");
    priority = "contextual";
  }
  return { priority, reasons };
}

/** Set-level SYNTHESIS constraint (Stage 3.1): a Finding that synthesises
 *  component Findings which are themselves surfaced must NOT outrank the
 *  strongest surfaced component by default — that would double-count one story.
 *  Elevation requires an explicit governed/model-assisted flag. Returns the
 *  adjusted priority + reasons; never demotes below contextual. */
export function applySynthesisConstraint(
  finding: Finding,
  computed: Priority,
  componentPriorities: Priority[],
): { priority: Priority; reasons: string[] } {
  if (!finding.derivedFrom?.length) return { priority: computed, reasons: [] };
  // A GOVERNED-elevated synthesis is free to rank normally (Stage 5R.6 §7).
  if (finding.synthesisElevation) return { priority: computed, reasons: ["synthesis_elevated_by_review"] };
  // A non-elevated (e.g. model-proposed) synthesis: (a) can NEVER be Primary
  // (authority — model enthusiasm is not an elevation route), and (b) must not
  // exceed one-below its strongest surfaced component (no double-count of one story).
  const surfaced = componentPriorities.filter((p) => p !== "suppressed");
  const oneBelow = surfaced.length ? Math.min(PRIORITY_ORDER.contextual, Math.min(...surfaced.map((p) => PRIORITY_ORDER[p])) + 1) : PRIORITY_ORDER.secondary;
  const floorOrder = Math.max(PRIORITY_ORDER.secondary, oneBelow); // never better than Secondary
  if (PRIORITY_ORDER[computed] < floorOrder) {
    const reasons = ["synthesis_provisional_not_primary"];
    if (surfaced.length) reasons.push("synthesis_does_not_exceed_component_story");
    reasons.push("synthesis_elevation_requires_governed_route");
    return { priority: AT[floorOrder], reasons };
  }
  return { priority: computed, reasons: [] };
}

/** Deterministic presentation order within the same class: materiality, then
 *  confidence, then relevance, then original order (stable). */
const MAT_ORD = { critical: 0, high: 1, moderate: 2, low: 3, unable_to_assess: 4 };
const CONF_ORD = { high: 0, moderate: 1, low: 2, unsupported: 3, unable_to_assess: 4 };
const REL_ORD = { high: 0, moderate: 1, low: 2, unable_to_assess: 3 };
export function withinClassOrder(a: RankingInput, b: RankingInput): number {
  return (MAT_ORD[a.materiality.level] - MAT_ORD[b.materiality.level])
    || (CONF_ORD[a.confidence.level] - CONF_ORD[b.confidence.level])
    || (REL_ORD[a.relevance.level] - REL_ORD[b.relevance.level]);
}
