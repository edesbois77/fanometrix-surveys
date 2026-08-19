// ── Fanometrix Analytical Core — deterministic disconfirmation (Stage 4) ──────
// Only what can be honestly established from structured evidence. Semantic
// contradiction/alternative-explanation is model-assisted (flagged, never faked).

import type { Candidate } from "../candidates/types";
import type { DisconfirmationAssessment, DisconfirmationKind, DisconfirmationStatus } from "./types";
import type { Priority } from "../assessment/types";
import { classifyBase } from "../statistics/classify";

// ── Claim-level disconfirmation (Stage 5R.6) ──────────────────────────────────
// Which analytical claim a challenge TARGETS. Only a challenge to the Finding's
// CORE observation claim may demote/suppress it; a challenge to an attached
// interpretation or causal implication is a CAVEAT — it must not weaken an
// independently-grounded descriptive Result (Standard v1.2 §46.5).
export type ClaimTarget = "observation" | "interpretation" | "causal";
const KIND_TARGET: Record<DisconfirmationKind, ClaimTarget> = {
  direct_contradiction: "observation",
  counter_pattern: "observation",
  weak_magnitude: "observation",
  base_limitation: "observation",
  statistical_non_support: "observation",
  qualification: "observation",
  construct_mismatch: "interpretation", // challenges the label, not the number
  alternative_explanation: "causal",    // challenges the WHY, not the observation
};

export type DisconfirmationEffect = { suppress: boolean; demoteTo: Priority | null; caveats: string[] };

/** Translate a disconfirmation assessment into a bounded ranking effect. A
 *  contradiction/material-weakening of the CORE observation can suppress/demote;
 *  interpretation- or causal-only challenges are caveats and NEVER demote a valid
 *  descriptive observation. */
export function disconfirmationEffect(a: DisconfirmationAssessment): DisconfirmationEffect {
  const caveats = [...a.reasons];
  const coreKinds = a.kinds.filter((k) => KIND_TARGET[k] === "observation");
  // No challenge to the core claim → caveat only, whatever the aggregate status.
  if (coreKinds.length === 0) return { suppress: false, demoteTo: null, caveats };
  if (a.status === "contradicted" && coreKinds.includes("direct_contradiction")) return { suppress: true, demoteTo: null, caveats };
  if (a.status === "materially_weakened") return { suppress: false, demoteTo: "contextual", caveats };
  // qualified / none_found on the core claim → keep priority, attach caveat.
  return { suppress: false, demoteTo: null, caveats };
}

const STRENGTH: Record<DisconfirmationStatus, number> = { none_found: 0, qualified: 1, materially_weakened: 2, contradicted: 3, unable_to_assess: 0 };
const strongest = (a: DisconfirmationStatus, b: DisconfirmationStatus): DisconfirmationStatus => (STRENGTH[b] > STRENGTH[a] ? b : a);

export function assessDisconfirmation(c: Candidate): DisconfirmationAssessment {
  const kinds: DisconfirmationKind[] = [];
  const reasons: string[] = [];
  const evidenceIds: string[] = [];
  let status: DisconfirmationStatus = "none_found";

  if (c.evidence.length === 0) {
    return { status: "unable_to_assess", kinds: [], evidenceIds: [], reasons: ["no evidence to test against"], reviewRequired: true, assessor: "deterministic" };
  }

  // Contesting / qualifying stance on the supporting evidence.
  for (const e of c.evidence) {
    if (e.stance === "contests") { status = strongest(status, "contradicted"); kinds.push("direct_contradiction"); evidenceIds.push(e.id); reasons.push(`evidence ${e.id} contests the claim`); }
    else if (e.stance === "qualifies") { status = strongest(status, "qualified"); kinds.push("qualification"); evidenceIds.push(e.id); reasons.push(`evidence ${e.id} qualifies the claim`); }
  }

  // Weak magnitude behind a "leads" claim.
  if (c.kind === "leading_option" && (c.signals?.band === "weak" || c.signals?.band === "negligible")) {
    status = strongest(status, "materially_weakened"); kinds.push("weak_magnitude");
    reasons.push(`the lead (${c.signals?.leadPp}pp) is too small to support a clear leadership claim`);
  }

  // Base limitation.
  const baseMin = c.signals?.baseMin ?? Math.min(...c.evidence.map((e) => e.denominator ?? Infinity));
  if (Number.isFinite(baseMin)) {
    const bs = classifyBase(baseMin);
    if (bs === "suppressed" || bs === "directional") { status = strongest(status, bs === "suppressed" ? "materially_weakened" : "qualified"); kinds.push("base_limitation"); reasons.push(`base (${baseMin}) is ${bs} — the pattern rests on limited support`); }
  }

  // Statistical non-support of a dependent comparison.
  for (const r of c.results ?? []) {
    if (r.operation === "comparison" && r.statisticalAssessment?.status === "not_supported") {
      status = strongest(status, "materially_weakened"); kinds.push("statistical_non_support"); reasons.push("the tested difference this claim depends on is not statistically supported");
    }
  }

  // Unresolved temporal comparability behind a wave difference.
  if (c.kind === "wave_difference" && c.change && c.change.state !== "comparable_change" && c.change.state !== "trend") {
    status = strongest(status, "qualified"); kinds.push("qualification"); reasons.push("longitudinal comparability is unresolved — the difference cannot be read as a change");
  }

  // `none_found` is not proof: semantic disconfirmation (counter-patterns,
  // alternative explanations) still needs a model/human pass.
  const reviewRequired = status === "none_found" || c.reviewRequirements.length > 0;
  if (status === "none_found") reasons.push("no disconfirming evidence found by the deterministic method (not proof none exists)");

  return { status, kinds: [...new Set(kinds)], evidenceIds: [...new Set(evidenceIds)], reasons, reviewRequired, assessor: "deterministic" };
}
