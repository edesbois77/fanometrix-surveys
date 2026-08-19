// ── Benchmark 003 — discovery input + invalid-grouping probes (EVAL-ONLY) ──────
import type { DiscoveryInput, Candidate } from "@/lib/core/candidates/types";
import type { Evidence, Result } from "@/lib/core/evidence/types";
import { proportion } from "@/lib/core/evidence/scale";
import { TRANSIT_003 } from "./source";
import { TRANSIT003_OVERLAY } from "./overlay";

const Q = (key: string) => TRANSIT_003.questions.find((q) => q.key === key)!;

export function bench003DiscoveryInput(): DiscoveryInput {
  return {
    objective: TRANSIT_003.objective,
    questions: TRANSIT_003.questions.map((q) => ({
      questionKey: q.key, questionText: q.label, base: q.base,
      contribution: "elicited_perception" as const, sourceType: "survey" as const,
      options: q.options.map((o) => ({ id: o.id, label: o.label, count: o.count })),
      semantics: TRANSIT003_OVERLAY[q.key],
    })),
  };
}

function ev(qkey: string, oid: string): Evidence {
  const q = Q(qkey); const o = q.options.find((x) => x.id === oid)!;
  return { id: `${qkey}:${oid}`, kind: "base", contribution: "elicited_perception", sourceType: "survey", sourceId: "t003", question: { canonicalKey: qkey, text: q.label }, option: { id: oid, label: o.label }, numerator: o.count, denominator: q.base, denominatorType: "respondents", quantity: proportion(o.count / q.base) };
}
function grp(id: string, evs: Evidence[], construct: string, qkeys: string[]): Candidate {
  const base = evs[0].denominator!;
  const value = evs.reduce((a, e) => a + (e.numerator ?? 0), 0) / base;
  const cross = new Set(evs.map((e) => e.question?.canonicalKey)).size > 1;
  const result: Result = { id: `${id}#grp`, operation: "grouping", quantity: proportion(cross ? evs.reduce((a, e) => a + (e.numerator ?? 0) / (e.denominator ?? 1), 0) : value), components: evs.map((e) => e.id), grouping: { kind: "governed_semantic", componentLabels: evs.map((e) => e.option?.label ?? e.id), parentConstruct: construct } };
  return { id, kind: "semantic_grouping", claim: `${construct} relabel`, sourceQuestionKeys: qkeys, evidence: evs, results: [result], provenance: { generator: "external-model", deterministic: false, modelProposed: true }, reviewRequirements: ["semantic_construct"], state: "held_for_semantic_review" };
}

/** Tempting-but-invalid relabels a model might propose (Gold: all forbidden). */
export function bench003InvalidExternalCandidates(): Candidate[] {
  return [
    grp("ext-rel-mixed", [ev("q_reliability", "reliable"), ev("q_reliability", "mixed")], "broadly reliable", ["q_reliability"]),        // + neutral
    grp("ext-rel-poles", [ev("q_reliability", "very_reliable"), ev("q_reliability", "very_unreliable")], "strong opinion", ["q_reliability"]), // opposite poles
    grp("ext-reason-practical", [ev("q_reason", "cost"), ev("q_reason", "convenience")], "practical reasons", ["q_reason"]),                // cross-construct
    grp("ext-crossq", [ev("q_reliability", "reliable"), ev("q_recommend", "likely")], "overall positive", ["q_reliability", "q_recommend"]), // cross-question
  ];
}
