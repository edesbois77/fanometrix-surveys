// ── Stage 5R.5 — the semantic model is a non-authoritative proposer/reviewer ────
// The model may PROPOSE a construct or ABSTAIN; it can never approve, reject, or
// grant Construct Authority. Authority comes only from deterministic entailment
// (DERIVED) or governed routes. Deterministic outcomes are load-bearing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runAnalysis } from "../pipeline/analyse";
import { FixtureGroupingProposer, verdictToProposal, type GroupingProposal, type GroupingVerdict, type SemanticGroupingProposer } from "./grouping";
import { proportion } from "../evidence/scale";
import type { QuestionSemantics } from "./metadata";
import type { Candidate, DiscoveryInput } from "../candidates/types";
import type { Evidence } from "../evidence/types";

const OBJ = "Understand fan value and access preferences.";
const propose = (construct = "model construct", over: Partial<GroupingProposal> = {}): GroupingProposal => ({ proposedConstruct: construct, proposedLabel: construct, ambiguity: "low", competingInterpretations: false, rationale: [], ...over });
const ABSTAIN: GroupingProposal = { proposedConstruct: null, ambiguity: "high", competingInterpretations: true, rationale: ["no coherent construct"] };

function grouping(id: string): Candidate {
  const base = 200;
  const ev = (oid: string, n: number): Evidence => ({ id: `q_${id}:${oid}`, kind: "base", contribution: "elicited_perception", sourceType: "survey", sourceId: "s", question: { canonicalKey: `q_${id}`, text: "Qx" }, option: { id: oid, label: oid }, numerator: n, denominator: base, denominatorType: "respondents", quantity: proportion(n / base) });
  return { id, kind: "semantic_grouping", claim: "construct unverified", sourceQuestionKeys: [`q_${id}`], evidence: [ev("a", 80), ev("b", 60)], results: [{ id: `${id}#grp`, operation: "grouping", quantity: proportion(0.7), components: [`q_${id}:a`, `q_${id}:b`], grouping: { kind: "governed_semantic", componentLabels: ["A", "B"], parentConstruct: "construct unverified" } }], provenance: { generator: "external-model", deterministic: false, modelProposed: true }, reviewRequirements: ["semantic_construct"], state: "held_for_semantic_review" };
}
const question = (id: string, semantics?: QuestionSemantics) => ({ questionKey: `q_${id}`, questionText: "Qx", base: 200, options: [{ id: "a", count: 80 }, { id: "b", count: 60 }], semantics });
const run = (id: string, proposer: SemanticGroupingProposer, semantics?: QuestionSemantics) =>
  runAnalysis({ questions: [question(id, semantics)], objective: OBJ } as DiscoveryInput, { groupingProposer: proposer, externalCandidates: [grouping(id)] }).outcomes.find((o) => o.candidate.id === id)!;
const interpOf = (o: ReturnType<typeof run>) => o.candidate.results!.map((r) => r.interpretation).find(Boolean);

// ── Model cannot grant authority ───────────────────────────────────────────────
test("A: any model-origin proposal starts at authority = provisional", () => {
  const i = interpOf(run("a", new FixtureGroupingProposer({ a: propose() })))!;
  assert.equal(i.authority, "provisional");
  assert.equal(i.provenance, "model_proposed");
});

test("B: no model output field can produce declared/derived/attested", () => {
  for (const p of [propose("x"), propose("x", { ambiguity: "low", competingInterpretations: false })]) {
    const i = interpOf(run("b", new FixtureGroupingProposer({ b: p })))!;
    assert.ok(["provisional"].includes(i.authority));
    assert.notEqual(i.authority, "declared");
    assert.notEqual(i.authority, "derived");
    assert.notEqual(i.authority, "attested");
  }
});

test("C: repeated identical model proposals never upgrade authority", () => {
  const runs = [0, 1, 2, 3, 4].map(() => interpOf(run("c", new FixtureGroupingProposer({ c: propose() })))!.authority);
  assert.deepEqual(new Set(runs), new Set(["provisional"]));
});

test("D: 'confident' review signals (low ambiguity, no competing) cannot clear review or raise authority", () => {
  const o = run("d", new FixtureGroupingProposer({ d: propose("x", { ambiguity: "low", competingInterpretations: false }) }));
  assert.equal(interpOf(o)!.authority, "provisional");
  assert.equal(interpOf(o)!.reviewRequired, true);           // review not cleared
  assert.ok(o.candidate.reviewRequirements.length > 0);
  assert.equal(o.priority, "contextual");
});

// ── Deterministic entailment overrides the model ──────────────────────────────
const sem = (id: string, a: string, b: string): QuestionSemantics => ({ questionKey: `q_${id}`, scaleType: "nominal", provenance: "source_declared", options: [{ optionId: "a", constructId: a }, { optionId: "b", constructId: b }] });

test("override: model proposes but entailment says not_entailed → rejected (model cannot override)", () => {
  const o = run("e", new FixtureGroupingProposer({ e: propose("one construct") }), sem("e", "relevance", "awareness"));
  assert.equal(o.finalState, "rejected");                    // deterministic wins over the proposal
});

test("override: entailment entailed → DERIVED via metadata, not because the model proposed", () => {
  let called = 0;
  const spy: SemanticGroupingProposer = { propose() { called++; return propose(); } };
  const o = run("f", spy, sem("f", "relevance", "relevance"));
  assert.equal(interpOf(o)!.authority, "derived");
  assert.equal(interpOf(o)!.provenance, "deterministic_recode");
  assert.equal(called, 0);                                   // model not even consulted
});

test("override: entailment unable + model proposes → provisional (not derived)", () => {
  const o = run("g", new FixtureGroupingProposer({ g: propose() })); // no semantics → unable
  assert.equal(interpOf(o)!.authority, "provisional");
});

// ── Abstention ────────────────────────────────────────────────────────────────
test("abstention: model offers no construct → nothing invented, grouping held, no authority", () => {
  const o = run("h", new FixtureGroupingProposer({ h: ABSTAIN }));
  assert.equal(o.finalState, "held_for_semantic_review");
  assert.equal(interpOf(o), undefined);
  assert.notEqual(o.priority, "primary");
});

test("abstention: a dataset with no useful proposal still yields ordinary descriptive Findings", () => {
  const input: DiscoveryInput = { questions: [{ questionKey: "value", questionText: "value", base: 274, sourceType: "survey", contribution: "elicited_perception", options: [{ id: "rewards", label: "Rewards", count: 130 }, { id: "experiences", label: "Experiences", count: 74 }, { id: "other", label: "Other", count: 70 }] }], objective: OBJ };
  const outcomes = runAnalysis(input, { groupingProposer: new FixtureGroupingProposer({}) }).outcomes; // model abstains on everything
  const lead = outcomes.find((o) => o.candidate.kind === "leading_option")!;
  assert.ok(["primary", "secondary"].includes(lead.priority ?? "")); // ordinary analysis unaffected by the model
});

// ── Provenance separation (idea origin vs authority origin) ────────────────────
test("provenance: a model-proposed idea that becomes DERIVED records deterministic authority origin", () => {
  // The engine-authored DERIVED interpretation is provenance=deterministic_recode
  // (authority origin), while the model path would have been model_proposed. The
  // audit trail (derivation.method) shows WHY authority was granted.
  const derived = interpOf(run("i", new FixtureGroupingProposer({ i: propose() }), sem("i", "relevance", "relevance")))!;
  assert.equal(derived.provenance, "deterministic_recode");
  assert.equal(derived.derivation?.method, "same_governed_construct_union");
  const provisional = interpOf(run("j", new FixtureGroupingProposer({ j: propose() })))!;
  assert.equal(provisional.provenance, "model_proposed");
});

// ── verdictToProposal drops self-certification ─────────────────────────────────
test("legacy verdict adapter: humanReviewRequired=false does not become approval; 'no' coherence abstains", () => {
  const coherent: GroupingVerdict = { constructCoherent: "yes", labelFaithful: "yes", informationGain: "yes", competingRisk: "low", humanReviewRequired: false, construct: "c", reasons: [] };
  assert.equal(verdictToProposal(coherent).proposedConstruct, "c");
  const noConstruct: GroupingVerdict = { constructCoherent: "yes", labelFaithful: "yes", informationGain: "yes", competingRisk: "low", humanReviewRequired: false, reasons: [] };
  assert.equal(verdictToProposal(noConstruct).proposedConstruct, null); // no construct offered → abstain
  const incoherent: GroupingVerdict = { constructCoherent: "no", labelFaithful: "no", informationGain: "unclear", competingRisk: "high", humanReviewRequired: false, construct: "x", reasons: [] };
  assert.equal(verdictToProposal(incoherent).proposedConstruct, null); // 'no' → abstain despite hRR=false
});
