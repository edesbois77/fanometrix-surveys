// ── Fanometrix Analytical Core — Core → Survey Studio product projection (Stage 6) ─
// PURE. Translates a Core AnalysisResult into a clean, product-facing findings
// contract for Survey Studio. It is the ONE boundary where engine concepts become
// user language: internal machinery (candidate ids, "threshold recode", authority
// enums, ledger) is NEVER leaked to the client. Only PROMOTED outcomes are projected
// (suppressed/held are dropped). Deterministic: same AnalysisResult → same projection.
//
// AUTHORITY, honestly surfaced but de-jargonised:
//   derived      → basis "governed"     — a governed scale grouping, safe to headline
//   (descriptive)→ basis "observed"     — a plain measured fact, no interpretation
//   provisional  → basis "exploratory"  — a model-proposed reading, subordinate, capped
// A provisional/model reading can NEVER be a "key" finding here (it is re-tiered to
// context) — so model-origin content can never masquerade as a deterministic headline.

import type { AnalysisResult, CandidateOutcome } from "../pipeline/analyse";
import type { Candidate } from "../candidates/types";

export const CORE_PROJECTION_VERSION = "core-projection-v1";

/** Product tier — plain language for the Core's primary/secondary/contextual. */
export type CoreFindingTier = "key" | "supporting" | "context";
/** How much a finding can be trusted, in product terms (never the raw authority enum). */
export type CoreFindingBasis = "governed" | "observed" | "exploratory";

export type CoreEvidenceRef = { question: string; option?: string; count: number; base: number; percentage: number | null };

export type CoreFinding = {
  id: string;                      // opaque, stable per candidate (not shown)
  tier: CoreFindingTier;
  basis: CoreFindingBasis;
  title: string;                   // the finding in product language
  statistic?: string;              // e.g. "65%" — the headline figure, when there is one
  question?: string;               // the survey question it concerns
  caveats: string[];
  evidence: CoreEvidenceRef[];     // the base figures it rests on (full traceability)
};

export type CoreFindingsProjection = {
  version: string;
  generatedFrom: "immutable_snapshot";
  deterministic: true;             // Stage 6 v1 runs no model proposer
  findings: CoreFinding[];
  counts: { key: number; supporting: number; context: number };
};

const pct1 = (x: number): number => Math.round(x * 1000) / 10;

const TIER: Record<string, CoreFindingTier> = { primary: "key", secondary: "supporting", contextual: "context" };

/** Product basis from the promoted candidate's interpretation (if any). */
function basisOf(c: Candidate): CoreFindingBasis {
  const interp = (c.results ?? []).map((r) => r.interpretation).find(Boolean);
  if (interp?.authority === "derived") return "governed";
  if (interp?.authority === "provisional") return "exploratory";
  return "observed"; // descriptive candidate with no interpretation
}

/** The headline % for a candidate, from its grouping/comparison Result or its signals. */
function statOf(c: Candidate): { statistic?: string; value?: number } {
  const grouped = (c.results ?? []).find((r) => r.grouping || r.operation === "grouping");
  if (grouped && grouped.quantity.unit === "proportion") return { statistic: `${pct1(grouped.quantity.value)}%`, value: pct1(grouped.quantity.value) };
  const top = c.signals?.topSharePct;
  if (typeof top === "number") return { statistic: `${Math.round(top * 10) / 10}%`, value: top };
  return {};
}

/** Product-language title — built from STRUCTURE, never the raw engine claim. */
function titleOf(c: Candidate, stat: { statistic?: string }): string {
  const q = c.evidence[0]?.question?.text ?? c.sourceQuestionKeys[0] ?? "this question";
  const grouping = (c.results ?? []).find((r) => r.grouping)?.grouping;
  switch (c.kind) {
    case "semantic_grouping": {
      const labels = grouping?.componentLabels ?? [];
      const joined = labels.length ? labels.join(" or ") : "these answers";
      return `${stat.statistic ?? ""} selected “${joined}”`.trim();
    }
    case "leading_option": {
      const topLabel = c.evidence.slice().sort((a, b) => (b.numerator ?? 0) - (a.numerator ?? 0))[0]?.option?.label ?? "the top answer";
      return `“${topLabel}” is the most common answer${stat.statistic ? ` (${stat.statistic})` : ""}`;
    }
    case "distribution_shape":
      return `Opinion on “${q}” is divided — no single answer stands out`;
    case "notable_minority": {
      const lbl = c.evidence[0]?.option?.label ?? "one answer";
      return `A notable ${stat.statistic ?? "share"} chose “${lbl}”`;
    }
    case "wave_difference":
      return `Responses to “${q}” shifted between waves`;
    default:
      // Fallback: de-jargonise the engine claim.
      return c.claim.replace(/Governed (positive|negative) threshold recode of /i, "").replace(/\bgoverned\b/gi, "").trim();
  }
}

function evidenceOf(c: Candidate): CoreEvidenceRef[] {
  return c.evidence
    .filter((e) => e.kind === "base" && e.question)
    .map((e) => ({
      question: e.question!.text ?? e.question!.canonicalKey,
      option: e.option?.label,
      count: e.numerator ?? 0,
      base: e.denominator ?? 0,
      percentage: e.denominator ? pct1((e.numerator ?? 0) / e.denominator) : null,
    }));
}

function projectOne(o: CandidateOutcome): CoreFinding | null {
  if (o.finalState !== "promoted" || !o.priority || !(o.priority in TIER)) return null;
  const c = o.candidate;
  const basis = basisOf(c);
  const stat = statOf(c);
  // A model-origin (exploratory) reading can never be a "key" finding — re-tier to context.
  let tier = TIER[o.priority];
  if (basis === "exploratory" && tier === "key") tier = "context";
  const interp = (c.results ?? []).map((r) => r.interpretation).find(Boolean);
  const caveats = [
    ...(interp?.caveats ?? []),
    ...(basis === "exploratory" ? ["This is a possible interpretation, not a confirmed finding."] : []),
  ];
  return {
    id: c.id, tier, basis,
    title: titleOf(c, stat),
    ...(stat.statistic ? { statistic: stat.statistic } : {}),
    question: c.evidence[0]?.question?.text ?? undefined,
    caveats,
    evidence: evidenceOf(c),
  };
}

const TIER_ORDER: Record<CoreFindingTier, number> = { key: 0, supporting: 1, context: 2 };

/** Project a Core AnalysisResult into the Survey Studio product findings contract. */
export function projectAnalysis(result: AnalysisResult): CoreFindingsProjection {
  const findings = result.outcomes
    .map(projectOne)
    .filter((f): f is CoreFinding => f != null)
    .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
  return {
    version: CORE_PROJECTION_VERSION,
    generatedFrom: "immutable_snapshot",
    deterministic: true,
    findings,
    counts: {
      key: findings.filter((f) => f.tier === "key").length,
      supporting: findings.filter((f) => f.tier === "supporting").length,
      context: findings.filter((f) => f.tier === "context").length,
    },
  };
}
