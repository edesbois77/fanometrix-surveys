// ── Benchmark 002 — discovery input + invalid-grouping probes (EVAL-ONLY) ──────
import type { DiscoveryInput, Candidate } from "@/lib/core/candidates/types";
import type { Evidence, Result } from "@/lib/core/evidence/types";
import { proportion } from "@/lib/core/evidence/scale";
import { PRODUCT_FEEDBACK_002 } from "./source";
import { BENCH002_OVERLAY } from "./overlay";

const Q = (key: string) => PRODUCT_FEEDBACK_002.questions.find((q) => q.key === key)!;

export function bench002DiscoveryInput(): DiscoveryInput {
  return {
    objective: PRODUCT_FEEDBACK_002.objective,
    questions: PRODUCT_FEEDBACK_002.questions.map((q) => ({
      questionKey: q.key, questionText: q.label, base: q.base,
      contribution: "elicited_perception" as const, sourceType: "survey" as const,
      options: q.options.map((o) => ({ id: o.id, label: o.label, count: o.count })),
      semantics: BENCH002_OVERLAY[q.key],
    })),
  };
}

function ev(qkey: string, oid: string): Evidence {
  const q = Q(qkey); const o = q.options.find((x) => x.id === oid)!;
  return { id: `${qkey}:${oid}`, kind: "base", contribution: "elicited_perception", sourceType: "survey", sourceId: "b002", question: { canonicalKey: qkey, text: q.label }, option: { id: oid, label: o.label }, numerator: o.count, denominator: q.base, denominatorType: "respondents", quantity: proportion(o.count / q.base) };
}
function grp(id: string, qkey: string, a: string, b: string, labels: string[], construct: string, crossQ?: [string, string, string, string]): Candidate {
  const q = Q(qkey);
  const evs = crossQ ? [ev(crossQ[0], crossQ[1]), ev(crossQ[2], crossQ[3])] : [ev(qkey, a), ev(qkey, b)];
  const value = crossQ
    ? (Q(crossQ[0]).options.find((o) => o.id === crossQ[1])!.count / Q(crossQ[0]).base) + (Q(crossQ[2]).options.find((o) => o.id === crossQ[3])!.count / Q(crossQ[2]).base)
    : (q.options.find((o) => o.id === a)!.count + q.options.find((o) => o.id === b)!.count) / q.base;
  const result: Result = { id: `${id}#grp`, operation: "grouping", quantity: proportion(value), components: evs.map((e) => e.id), grouping: { kind: "governed_semantic", componentLabels: labels, parentConstruct: construct } };
  return { id, kind: "semantic_grouping", claim: `${id} relabel`, sourceQuestionKeys: crossQ ? [crossQ[0], crossQ[2]] : [qkey], evidence: evs, results: [result], provenance: { generator: "external-model", deterministic: false, modelProposed: true }, reviewRequirements: ["semantic_construct"], state: "held_for_semantic_review" };
}

/** The tempting-but-invalid relabels a model might propose (Gold: all forbidden). */
export function bench002InvalidExternalCandidates(): Candidate[] {
  return [
    // Same-dimension but WRONG threshold (neither is not satisfied) — Gold-forbidden.
    grp("ext-sat-neutral", "q_satisfaction", "satisfied", "neutral", ["Satisfied", "Neither"], "positive sentiment"),
    // Same-dimension OPPOSITE poles — Gold-forbidden polarity error.
    grp("ext-top-bottom", "q_satisfaction", "very_satisfied", "very_dissatisfied", ["Very satisfied", "Very dissatisfied"], "strong opinion"),
    // Cross-CONSTRUCT nominal relabel — Gold-forbidden.
    grp("ext-software", "q_blocker", "connectivity", "app_issues", ["Bluetooth dropouts", "Companion app bugs"], "software problems"),
    // Cross-QUESTION sum — Gold-forbidden (structural).
    grp("ext-crossq", "q_satisfaction", "", "", ["Satisfied", "Probably would recommend"], "overall positive", ["q_satisfaction", "satisfied", "q_recommend", "probably"]),
  ];
}
