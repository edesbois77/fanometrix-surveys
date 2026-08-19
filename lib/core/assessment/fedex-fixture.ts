// ── Stage 3 FedEx shadow fixture (EVAL DATA — not production) ──────────────────
// Candidate Findings representing the FedEx UCL analysis, built from the
// benchmark source aggregates. Includes the five Gold Standard MUST-FINDs, two
// MAY candidates, and three INVALID candidates (dominant overstatement, the 55.8
// relabel, the 69.3 cross-question sum). Generic assessment logic (never
// FedEx-specific) is exercised against these.

import type { Finding } from "../findings/types";
import type { AnalysisContext } from "./types";
import { proportion, percentagePoints } from "../evidence/scale";
import type { Evidence, Result } from "../evidence/types";
import { FEDEX_SOURCE } from "@/lib/intelligence-evals/benchmarks/fedex-ucl-001/source";
import { fedexSourceModel } from "@/lib/intelligence-evals/benchmarks/fedex-ucl-001/benchmark";

const Q = (key: string) => FEDEX_SOURCE.questions.find((q) => q.key === key)!;

function baseEvidence(qKey: string, optionIds?: string[]): Evidence[] {
  const q = Q(qKey);
  return q.options
    .filter((o) => !optionIds || optionIds.includes(o.id))
    .map((o) => ({
      id: `${qKey}:${o.id}`, kind: "base" as const, contribution: "elicited_perception" as const,
      sourceType: "survey" as const, sourceId: "fedex",
      question: { canonicalKey: qKey, text: q.label }, option: { id: o.id, label: o.label },
      numerator: o.combined, denominator: q.base, denominatorType: "respondents" as const,
      quantity: proportion(o.combined / q.base),
    }));
}

/** Per-wave evidence for one option (both sides of a wave comparison). */
function waveEvidence(qKey: string, optId: string): Evidence[] {
  const q = Q(qKey); const o = q.options.find((x) => x.id === optId)!;
  return [
    { id: `${qKey}:${optId}:s1`, kind: "base", contribution: "elicited_perception", sourceType: "survey", sourceId: "fedex", question: { canonicalKey: qKey, text: q.label }, option: { id: optId, label: o.label }, numerator: o.s1, denominator: q.s1Base, denominatorType: "respondents", quantity: proportion(o.s1 / q.s1Base) },
    { id: `${qKey}:${optId}:s2`, kind: "base", contribution: "elicited_perception", sourceType: "survey", sourceId: "fedex", question: { canonicalKey: qKey, text: q.label }, option: { id: optId, label: o.label }, numerator: o.s2, denominator: q.s2Base, denominatorType: "respondents", quantity: proportion(o.s2 / q.s2Base) },
  ];
}

const comparison = (pp: number): Result => ({ id: "lead", operation: "comparison", quantity: percentagePoints(pp) });
const grouping = (value: number, comps: string[], labels: string[], construct: string): Result => ({
  id: "grp", operation: "grouping", quantity: percentagePoints(value), components: comps,
  grouping: { kind: "governed_semantic", componentLabels: labels, parentConstruct: construct },
});

const V = { standardVersion: "1.1", coreVersion: "0.1.0", runProvenance: null };

export function fedexCandidates(): Finding[] {
  return [
    {
      id: "mf-1", statement: "Around two-thirds of fans perceive at least some relevance between FedEx and the Champions League, but only a third describe it as a strong natural fit and a quarter have never noticed FedEx.",
      assertionType: "descriptive", questions: ["q_fit"],
      evidence: baseEvidence("q_fit"),
      results: [grouping(64.6, ["q_fit:strong_fit", "q_fit:relevant_unclear"], ["Strong natural fit", "Relevant but unclear"], "perceives at least some relevance")],
      version: V, status: "candidate",
    },
    {
      id: "mf-2", statement: "Tangible rewards and benefits are the clearest general fan expectation of sponsors, standing materially ahead of the other options.",
      assertionType: "descriptive", questions: ["q_offer"],
      evidence: baseEvidence("q_offer"), results: [comparison(14.6)],
      version: V, status: "candidate",
    },
    {
      id: "mf-3", statement: "Asked specifically how FedEx could help fans, access to experiences emerges as the leading opportunity.",
      assertionType: "descriptive", questions: ["q_help"],
      evidence: baseEvidence("q_help"), results: [comparison(8.3)],
      version: V, status: "candidate",
    },
    {
      id: "mf-4", statement: "Across both activation questions fans consistently favour forms of sponsorship offering tangible value or access: rewards lead general expectations while access to experiences leads the FedEx-specific question.",
      assertionType: "descriptive", questions: ["q_offer", "q_help"],
      evidence: [...baseEvidence("q_offer", ["rewards"]), ...baseEvidence("q_help", ["experiences_access"])],
      derivedFrom: ["mf-2", "mf-3"], // an explicit synthesis of the two component findings
      version: V, status: "candidate",
    },
    {
      id: "mf-5", statement: "Respondents occupy distinctly different states of sponsorship recognition and understanding, rather than a simple likes-versus-dislikes split.",
      assertionType: "descriptive", questions: ["q_fit"],
      evidence: baseEvidence("q_fit"),
      version: V, status: "candidate",
    },
    {
      id: "may-1", statement: "Surveys 1 and 2 differ notably on investment in grassroots.",
      assertionType: "comparative", questions: ["q_offer"],
      evidence: waveEvidence("q_offer", "grassroots"),
      // A cross-wave comparison whose longitudinal comparability is NOT established.
      change: { state: "dataset_difference", comparability: "not_comparable" },
      version: V, status: "candidate",
    },
    {
      id: "may-3", statement: "About one in ten see FedEx mainly in terms of brand visibility.",
      assertionType: "descriptive", questions: ["q_fit"],
      evidence: baseEvidence("q_fit", ["brand_visibility"]),
      version: V, status: "candidate",
    },
    {
      id: "inv-dominant", statement: "Strong natural fit is the dominant perception of FedEx.",
      assertionType: "descriptive", questions: ["q_fit"],
      evidence: baseEvidence("q_fit", ["strong_fit"]),
      version: V, status: "candidate",
    },
    {
      id: "inv-55", statement: "55.8% of fans have a visibility problem.",
      assertionType: "descriptive", questions: ["q_fit"],
      evidence: baseEvidence("q_fit", ["relevant_unclear", "never_noticed"]),
      results: [grouping(55.8, ["q_fit:relevant_unclear", "q_fit:never_noticed"], ["Relevant but unclear", "Never noticed them"], "visibility problem")],
      version: V, status: "candidate",
    },
    {
      id: "inv-69", statement: "Rewards and experiences are preferred by 69.3% of fans.",
      assertionType: "descriptive", questions: ["q_offer", "q_help"],
      evidence: [...baseEvidence("q_offer", ["rewards"]), ...baseEvidence("q_help", ["experiences_access"])],
      version: V, status: "candidate",
    },
  ];
}

export const FEDEX_CONTEXT: AnalysisContext = {
  objective: "Understand how football fans perceive FedEx as a UEFA Champions League sponsor, and what sponsors could offer fans, to guide FedEx's UCL sponsorship activation.",
  researchQuestions: [
    "How do fans perceive FedEx as a Champions League sponsor?",
    "What should sponsors offer fans?",
    "How could FedEx help fans most?",
  ],
  // Cross-question sum detection needs the governed option percentages; no
  // governedNumbers (so a valid grouping like 64.6 is not mis-flagged).
  governance: { sourceOptions: fedexSourceModel().options },
};
