// ── Fanometrix Analytical Core — deterministic candidate generation (Stage 4) ─
// Generates candidates from governed distributions ONLY where deterministic:
// distribution shape, a clear leading option, notable minorities, wave
// differences, and a top-2 grouping PROPOSAL (held for semantic review — the
// construct is never invented deterministically). NEVER creates cross-question
// arithmetic. Selective by construction (no per-option commentary, no inverse
// duplicates). No benchmark dependency.

import type { Candidate, DiscoveryInput, QuestionDistribution, OptionCount } from "./types";
import type { Evidence, Result } from "../evidence/types";
import { proportion, percentagePoints } from "../evidence/scale";
import { classifyCandidateDifference } from "../statistics/classify";

const round1 = (x: number): number => Math.round(x * 10) / 10;
const MINORITY_MIN = 0.20;   // a "substantial" minority worth noting
const MIN_BASE = 30;         // below this, distributions are not turned into candidates

function optionEvidence(q: QuestionDistribution, o: OptionCount, base = q.base, idSuffix = ""): Evidence {
  return {
    id: `${q.questionKey}:${o.id}${idSuffix}`, kind: "base",
    contribution: q.contribution ?? "elicited_perception", sourceType: q.sourceType ?? "survey", sourceId: "discovery",
    question: { canonicalKey: q.questionKey, text: q.questionText }, option: { id: o.id, label: o.label },
    numerator: o.count, denominator: base, denominatorType: "respondents", quantity: proportion(base > 0 ? o.count / base : 0),
  };
}

function pctOf(o: OptionCount, base: number): number { return base > 0 ? (o.count / base) * 100 : 0; }

function distributionCandidates(q: QuestionDistribution): Candidate[] {
  if (q.base < MIN_BASE || q.options.length === 0) return [];
  const sorted = [...q.options].sort((a, b) => pctOf(b, q.base) - pctOf(a, q.base));
  const top = sorted[0], second = sorted[1];
  const evidence = q.options.map((o) => optionEvidence(q, o));
  const leadPp = second ? round1(pctOf(top, q.base) - pctOf(second, q.base)) : round1(pctOf(top, q.base));
  const band = classifyCandidateDifference(leadPp);
  const topLabel = top.label ?? top.id;
  const prov = { generator: "distribution", deterministic: true, modelProposed: false };
  const signals = { leadPp, band, topSharePct: round1(pctOf(top, q.base)), baseMin: q.base };

  // The lead as a comparison Result, so materiality can read its magnitude.
  const leadResult: Result = { id: `${q.questionKey}#leadgap`, operation: "comparison", quantity: percentagePoints(leadPp), components: [`${q.questionKey}:${top.id}`, second ? `${q.questionKey}:${second.id}` : ""] .filter(Boolean) };
  const primary: Candidate = (band === "clear" || band === "strong")
    ? { id: `${q.questionKey}#lead`, kind: "leading_option", claim: `${topLabel} is the leading response (+${leadPp}pp over the next).`, sourceQuestionKeys: [q.questionKey], evidence, results: [leadResult], signals, provenance: prov, reviewRequirements: [], state: "generated" }
    : { id: `${q.questionKey}#dist`, kind: "distribution_shape", claim: `Responses to ${q.questionText ?? q.questionKey} are spread with no clear front-runner (top: ${topLabel} at ${round1(pctOf(top, q.base))}%, lead only ${leadPp}pp).`, sourceQuestionKeys: [q.questionKey], evidence, signals, provenance: prov, reviewRequirements: [], state: "generated" };

  const out: Candidate[] = [primary];
  // At most ONE notable minority, and only where there is no clear leader (a
  // substantial response ranked 3rd or lower, not a co-leader) — avoids noise.
  const minority = primary.kind === "distribution_shape" ? sorted.slice(2).find((o) => pctOf(o, q.base) / 100 >= MINORITY_MIN) : undefined;
  if (minority) {
    out.push({ id: `${q.questionKey}#min:${minority.id}`, kind: "notable_minority", claim: `A substantial minority (${round1(pctOf(minority, q.base))}%) chose "${minority.label ?? minority.id}".`, sourceQuestionKeys: [q.questionKey], evidence: [optionEvidence(q, minority)], signals: { topSharePct: round1(pctOf(minority, q.base)), baseMin: q.base }, provenance: prov, reviewRequirements: [], state: "generated" });
  }
  return out;
}

function waveCandidates(q: QuestionDistribution): Candidate[] {
  if (!q.waves || q.waves.length < 2) return [];
  const a = q.waves[0], b = q.waves[q.waves.length - 1];
  const out: Candidate[] = [];
  for (const o of q.options) {
    const oa = a.options.find((x) => x.id === o.id), ob = b.options.find((x) => x.id === o.id);
    if (!oa || !ob || a.base < MIN_BASE || b.base < MIN_BASE) continue;
    const diff = round1(Math.abs(pctOf(oa, a.base) - pctOf(ob, b.base)));
    const band = classifyCandidateDifference(diff);
    if (band !== "clear" && band !== "strong") continue; // selective: only notable wave moves
    out.push({
      id: `${q.questionKey}#wave:${o.id}`, kind: "wave_difference",
      claim: `"${o.label ?? o.id}" differs between waves (${round1(pctOf(oa, a.base))}% vs ${round1(pctOf(ob, b.base))}%, ${diff}pp).`,
      sourceQuestionKeys: [q.questionKey],
      evidence: [optionEvidence(q, oa, a.base, `:${a.waveId}`), optionEvidence(q, ob, b.base, `:${b.waveId}`)],
      change: { state: "dataset_difference", comparability: "not_comparable" },
      signals: { magnitudePp: diff, band, baseMin: Math.min(a.base, b.base) },
      provenance: { generator: "wave-difference", deterministic: true, modelProposed: false },
      reviewRequirements: ["temporal_comparability"], state: "generated",
    });
  }
  return out.slice(0, 2); // cap
}

/** A top-2 grouping PROPOSAL — components are deterministic (the two most-selected
 *  options); the CONSTRUCT is never invented here, so it is held for the semantic
 *  judge. This is how a legitimate grouping (e.g. a "some relevance" pairing) is
 *  PROPOSED from the data without receiving the answer. */
function top2GroupingProposal(q: QuestionDistribution): Candidate | null {
  if (q.base < MIN_BASE || q.options.length < 3) return null; // grouping only meaningful with >2 options
  const sorted = [...q.options].sort((a, b) => b.count - a.count);
  const [c1, c2] = sorted;
  const value = proportion((c1.count + c2.count) / q.base);
  const result: Result = {
    id: `${q.questionKey}#grp`, operation: "grouping", quantity: value,
    components: [`${q.questionKey}:${c1.id}`, `${q.questionKey}:${c2.id}`],
    grouping: { kind: "governed_semantic", componentLabels: [c1.label ?? c1.id, c2.label ?? c2.id], parentConstruct: "(unverified — pending semantic review)" },
  };
  return {
    id: `${q.questionKey}#grouping`, kind: "semantic_grouping",
    claim: `Proposed grouping: "${c1.label ?? c1.id}" + "${c2.label ?? c2.id}" = ${round1(((c1.count + c2.count) / q.base) * 100)}% (construct unverified).`,
    sourceQuestionKeys: [q.questionKey],
    evidence: [optionEvidence(q, c1), optionEvidence(q, c2)], results: [result],
    derivation: { operation: "grouping", componentIds: result.components!, arithmetic: `${c1.count} + ${c2.count} of ${q.base}` },
    provenance: { generator: "top2-grouping-proposal", deterministic: true, modelProposed: false },
    reviewRequirements: ["semantic_construct", "label_fidelity", "information_gain"],
    state: "held_for_semantic_review", stateReason: "grouping construct not yet verified (semantic)",
  };
}

/** Governed ordinal THRESHOLD recodes (Stage 5R.9R). For an ordinal question whose
 *  governed metadata declares polarity, propose the positive-region and
 *  negative-region boxes — driven by SCALE SEMANTICS, not response magnitude, and
 *  never every adjacent subset. With no governed polarity, no threshold candidate is
 *  proposed (§12: no metadata = no deterministic threshold candidate). Authority is
 *  still decided downstream by deterministic entailment, not here. */
function governedThresholdProposals(q: QuestionDistribution): Candidate[] {
  const qs = q.semantics;
  if (!qs || qs.scaleType !== "ordinal") return [];
  const out: Candidate[] = [];
  for (const pol of ["positive", "negative"] as const) {
    const regionIds = new Set(qs.options.filter((o) => o.polarity === pol && o.ordinalPosition != null).map((o) => o.optionId));
    const opts = q.options.filter((o) => regionIds.has(o.id));
    if (opts.length < 2) continue; // a single-option region is not a recode
    const count = opts.reduce((a, o) => a + o.count, 0);
    const components = opts.map((o) => `${q.questionKey}:${o.id}`);
    const result: Result = {
      id: `${q.questionKey}#${pol}grp`, operation: "grouping", quantity: proportion(count / q.base), components,
      grouping: { kind: "governed_semantic", componentLabels: opts.map((o) => o.label ?? o.id), parentConstruct: qs.constructId ?? "(governed threshold)" },
    };
    out.push({
      id: `${q.questionKey}#${pol === "positive" ? "top" : "bottom"}box`, kind: "semantic_grouping",
      claim: `Governed ${pol} threshold recode of ${q.questionText ?? q.questionKey} = ${round1((count / q.base) * 100)}%.`,
      sourceQuestionKeys: [q.questionKey], evidence: opts.map((o) => optionEvidence(q, o)), results: [result],
      derivation: { operation: "grouping", componentIds: components, arithmetic: `${opts.map((o) => o.count).join(" + ")} of ${q.base}` },
      provenance: { generator: "governed-threshold-recode", deterministic: true, modelProposed: false },
      reviewRequirements: [], state: "held_for_semantic_review", stateReason: `governed ${pol} threshold region`,
    });
  }
  return out;
}

/** Deterministic generation only. Semantic groupings/syntheses are PROPOSED here
 *  (held) and decided by deterministic entailment / the semantic model in the
 *  pipeline — never auto-accepted. */
export function generateCandidates(input: DiscoveryInput): Candidate[] {
  const out: Candidate[] = [];
  for (const q of input.questions) {
    out.push(...distributionCandidates(q));
    out.push(...waveCandidates(q));
    // Ordinal scales use GOVERNED THRESHOLD recodes (scale semantics); nominal /
    // metadata-less questions use the magnitude-based top-2 proposal (Stage 5R.9R
    // §10 — magnitude ordering is not scale order).
    if (q.semantics?.scaleType === "ordinal") {
      out.push(...governedThresholdProposals(q));
    } else {
      const grp = top2GroupingProposal(q);
      if (grp) out.push(grp);
    }
  }
  return out;
}
