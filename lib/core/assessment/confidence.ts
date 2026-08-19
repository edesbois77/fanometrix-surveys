// ── Fanometrix Analytical Core — confidence (Stage 3, deterministic) ──────────
// How strongly does the available evidence support THIS claim (Decision 5)?
// Categorical, claim-specific, derived from structured signals — never the
// model's self-declared confidence. Internal ordering is lexicographic over a
// small ordinal, but only categories + structured reasons are emitted.

import type { Finding } from "../findings/types";
import type { ConfidenceAssessment } from "./types";
import {
  worstBaseState, contributionKinds, independentSupport, hasContesting, hasQualifying, inferentialDistance,
} from "./signals";

const LEVELS = ["low", "moderate", "high"] as const;
const clamp = (i: number) => LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i))];

export function assessConfidence(f: Finding): ConfidenceAssessment {
  const reasons: string[] = [];
  const constraints: string[] = [];

  if (f.evidence.length === 0) {
    return { level: "unable_to_assess", reasons: [], constraints: ["no supporting evidence attached"], assessor: "deterministic" };
  }

  const distance = inferentialDistance(f);
  const support = f.statisticalAssessment?.status;

  // A claim that outruns its evidence class is UNSUPPORTED, not merely low: a
  // causal/predictive claim needs ≥2 contribution kinds or a supported test.
  if (f.assertionType === "causal" || f.assertionType === "predictive") {
    const kinds = contributionKinds(f).length;
    if (kinds < 2 && support !== "supported") {
      return { level: "unsupported", reasons: [], constraints: [`${f.assertionType} claim not supported by ≥2 evidence kinds or a statistical test`], assessor: "deterministic" };
    }
  }
  // A comparative/magnitude claim that DEPENDS on a tested difference which was
  // NOT supported is unsupported in that form.
  if ((f.assertionType === "comparative" || f.assertionType === "magnitude") && support === "not_supported") {
    return { level: "unsupported", reasons: [], constraints: ["the difference this claim depends on was tested and not supported"], assessor: "deterministic" };
  }

  // Base cap (Decision 1).
  const base = worstBaseState(f);
  let idx: number; // index into LEVELS
  switch (base) {
    case "stronger": idx = 2; reasons.push("stronger evidence base (n≥100)"); break;
    case "standard": idx = 2; reasons.push("standard analytical base (n≥50)"); break;
    case "analytically_usable": idx = 1; reasons.push("analytically usable base (n 30–49)"); break;
    case "directional": idx = 0; constraints.push("directional base (n 20–29)"); break;
    case "suppressed": idx = 0; constraints.push("base below the reportable minimum"); break;
    default: idx = 1; constraints.push("no explicit base — assessed conservatively"); break;
  }

  // Directly measured vs inferential (Decision 5).
  if (distance === 0) reasons.push("directly measured (descriptive)");
  else { idx = Math.min(idx, 1); constraints.push("inferential interpretation beyond direct measurement"); }

  // Statistical support strengthens a claim that rests on a tested difference.
  if (support === "supported") { idx = Math.min(2, idx + 1); reasons.push("difference is statistically supported"); }
  else if (support === "not_assessed") constraints.push("no statistical test performed (not the same as unsupported)");

  // Independent reinforcement (not duplicated evidence).
  if (independentSupport(f) >= 2) reasons.push("reinforced by multiple independent evidence lines");
  else constraints.push("rests on a single independent evidence line");

  // Contradiction / qualification reduce confidence.
  if (hasContesting(f)) { idx -= 1; constraints.push("contradicted by contesting evidence"); }
  if (hasQualifying(f)) { idx = Math.min(idx, 1); constraints.push("materially qualified by evidence"); }

  return { level: clamp(idx), reasons, constraints, assessor: "deterministic" };
}
