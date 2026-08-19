// ── Stage 4 — FedEx discovery EVAL fixture (exam code, not generation code) ────
// Builds the generic DiscoveryInput from the benchmark source aggregates and the
// fixture semantic judges / proposals that stand in for the model. The
// candidate-GENERATION modules import none of this (see the leakage test).

import type { DiscoveryInput, Candidate } from "../candidates/types";
import type { PipelineOptions } from "./analyse";
import { FixtureGroupingProposer, type GroupingProposal } from "../semantic/grouping";
import { FixtureSynthesisProposer, type SynthesisProposal, type SynthesisSignal } from "../semantic/synthesis";
import { FEDEX_SOURCE } from "@/lib/intelligence-evals/benchmarks/fedex-ucl-001/source";
import { proportion } from "../evidence/scale";
import type { Result } from "../evidence/types";

export function fedexDiscoveryInput(): DiscoveryInput {
  return {
    objective: "Understand how football fans perceive FedEx as a UEFA Champions League sponsor, and what value and access sponsors could offer fans, to guide FedEx's UCL sponsorship activation.",
    questions: FEDEX_SOURCE.questions.map((q) => ({
      questionKey: q.key, questionText: q.label, base: q.base,
      contribution: "elicited_perception" as const, sourceType: "survey" as const,
      options: q.options.map((o) => ({ id: o.id, label: o.label, count: o.combined })),
      waves: [
        { waveId: "s1", base: q.s1Base, options: q.options.map((o) => ({ id: o.id, label: o.label, count: o.s1 })) },
        { waveId: "s2", base: q.s2Base, options: q.options.map((o) => ({ id: o.id, label: o.label, count: o.s2 })) },
      ],
    })),
  };
}

// Fixture semantic PROPOSALS — these STAND IN for the non-authoritative bounded
// model (Stage 5R.5): a proposal offers a construct; an abstention offers none.
// They influence nothing about authority (a model proposal → at most PROVISIONAL).
// Eval data, never in the generation path.
const propose = (construct: string, reason: string): GroupingProposal => ({ proposedConstruct: construct, proposedLabel: construct, ambiguity: "low", competingInterpretations: false, rationale: [reason] });
const abstain = (reason: string): GroupingProposal => ({ proposedConstruct: null, ambiguity: "high", competingInterpretations: true, rationale: [reason] });

function q(qkey: string) { return FEDEX_SOURCE.questions.find((x) => x.key === qkey)!; }
function groupingResult(qkey: string, a: string, b: string, labels: string[], construct: string): Result {
  const qq = q(qkey); const oa = qq.options.find((o) => o.id === a)!, ob = qq.options.find((o) => o.id === b)!;
  return { id: `${qkey}#extgrp`, operation: "grouping", quantity: proportion((oa.combined + ob.combined) / qq.base), components: [`${qkey}:${a}`, `${qkey}:${b}`], grouping: { kind: "governed_semantic", componentLabels: labels, parentConstruct: construct } };
}

/** An externally/model-proposed 55.8 relabel and a 69.3 cross-question sum — used
 *  to prove neither survives governance. */
export function invalidExternalCandidates(): Candidate[] {
  const qf = q("q_fit"), qo = q("q_offer"), qh = q("q_help");
  const ev = (qkey: string, oid: string) => { const qq = q(qkey); const o = qq.options.find((x) => x.id === oid)!; return { id: `${qkey}:${oid}`, kind: "base" as const, contribution: "elicited_perception" as const, sourceType: "survey" as const, sourceId: "ext", question: { canonicalKey: qkey, text: qq.label }, option: { id: oid, label: o.label }, numerator: o.combined, denominator: qq.base, denominatorType: "respondents" as const, quantity: proportion(o.combined / qq.base) }; };
  void qf; void qo; void qh;
  return [
    { id: "ext-55", kind: "semantic_grouping", claim: "55.8% of fans have a visibility problem.", sourceQuestionKeys: ["q_fit"], evidence: [ev("q_fit", "relevant_unclear"), ev("q_fit", "never_noticed")], results: [groupingResult("q_fit", "relevant_unclear", "never_noticed", ["Relevant but unclear", "Never noticed them"], "visibility problem")], provenance: { generator: "external-model", deterministic: false, modelProposed: true }, reviewRequirements: ["semantic_construct"], state: "held_for_semantic_review" },
    { id: "ext-69", kind: "semantic_grouping", claim: "Rewards and experiences are preferred by 69.3% of fans.", sourceQuestionKeys: ["q_offer", "q_help"], evidence: [ev("q_offer", "rewards"), ev("q_help", "experiences_access")], results: [{ id: "ext69grp", operation: "grouping", quantity: proportion((qo.options.find((o) => o.id === "rewards")!.combined) / qo.base + (qh.options.find((o) => o.id === "experiences_access")!.combined) / qh.base), components: ["q_offer:rewards", "q_help:experiences_access"], grouping: { kind: "governed_semantic", componentLabels: ["Rewards", "Access to experiences"], parentConstruct: "value and access" } }], provenance: { generator: "external-model", deterministic: false, modelProposed: true }, reviewRequirements: ["semantic_construct"], state: "held_for_semantic_review" },
  ];
}

export function fedexPipelineOptions(includeInvalid = true): PipelineOptions {
  const groupingProposals: Record<string, GroupingProposal> = {
    // The model proposes a construct for the q_fit top-2 grouping (→ PROVISIONAL,
    // contextual — never authoritative without governed metadata / entailment).
    "q_fit#grouping": propose("perceives at least some relevance", "Both 'Strong natural fit' and 'Relevant but unclear' relate to perceived relevance."),
    // For the q_offer/q_help top-2s and the ext-55 relabel the model ABSTAINS
    // (offers no construct) → those groupings are held, not surfaced.
    "q_offer#grouping": abstain("Rewards and Better fan experiences are distinct offers, not one construct."),
    "q_help#grouping": abstain("Access and Connecting fans are distinct opportunities, not one construct."),
    "ext-55": abstain("'Relevant but unclear' and 'Never noticed' do not jointly denote a 'visibility problem'."),
  };
  const synthesisProposals: SynthesisProposal[] = [{
    id: "synthesis:value-access", claim: "Across both activation questions, fans consistently favour forms of sponsorship offering tangible value or access.",
    construct: "value and access", questionKeys: ["q_offer", "q_help"], componentCandidateIds: ["q_offer#lead", "q_help#dist"],
  }];
  const synthesisSignals: Record<string, SynthesisSignal> = {
    // The model proposes that the two activation questions form one value/access
    // story (→ a non-elevated, non-Primary synthesis). It grants no authority.
    "synthesis:value-access": { formsStory: true, ambiguity: "low", competingStories: false, rationale: ["Rewards (Q2) and access to experiences (Q3) both express a value/access preference."] },
  };
  return {
    groupingProposer: new FixtureGroupingProposer(groupingProposals),
    synthesisProposals,
    synthesisProposer: new FixtureSynthesisProposer(synthesisSignals),
    externalCandidates: includeInvalid ? invalidExternalCandidates() : [],
  };
}
