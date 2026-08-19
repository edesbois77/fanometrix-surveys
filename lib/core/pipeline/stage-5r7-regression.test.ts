// ── Stage 5R.7 — deterministic semantic-safety regression checkpoint ───────────
// Proves the REPAIRED semantic-authority spine end-to-end (layer interactions, not
// isolated units). No live model/network/DB — fixture proposers + spies only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runAnalysis, type PipelineOptions } from "./analyse";
import { FixtureGroupingProposer, verdictToProposal, type GroupingProposal, type GroupingVerdict, type SemanticGroupingProposer } from "../semantic/grouping";
import { FixtureSynthesisProposer, type SynthesisProposal } from "../semantic/synthesis";
import { assessEntailment } from "../semantic/entailment";
import { constructAuthorityOf } from "../semantic/interpretation";
import { AUTHORITY_CEILING, authorityWithinProvenance } from "../semantic/authority";
import { disconfirmationEffect } from "../disconfirmation/assess";
import type { DisconfirmationAssessment, DisconfirmationKind, DisconfirmationStatus } from "../disconfirmation/types";
import { assignPriority, type RankingInput } from "../assessment/ranking";
import { assessEligibility } from "../assessment/eligibility";
import { proportion } from "../evidence/scale";
import type { QuestionSemantics } from "../semantic/metadata";
import type { Candidate, DiscoveryInput } from "../candidates/types";
import type { Evidence } from "../evidence/types";
import type { Finding } from "../findings/types";

const OBJ = "Understand fan value and access preferences for the sponsorship.";
const B = 200;
const propose = (c = "model construct"): GroupingProposal => ({ proposedConstruct: c, proposedLabel: c, ambiguity: "low", competingInterpretations: false, rationale: [] });
const semFor = (m: Record<string, QuestionSemantics>) => (qk: string) => m[qk];
const V = { standardVersion: "1.2", coreVersion: "0.1.0", runProvenance: null };

// A structurally-valid same-question 2-option grouping over q_<id> (or cross-question).
function grouping(id: string, cross = false): Candidate {
  const qa = cross ? `q_${id}_1` : `q_${id}`, qb = cross ? `q_${id}_2` : `q_${id}`;
  const ev = (qk: string, oid: string, n: number): Evidence => ({ id: `${qk}:${oid}`, kind: "base", contribution: "elicited_perception", sourceType: "survey", sourceId: "s", question: { canonicalKey: qk, text: "Qx" }, option: { id: oid, label: oid }, numerator: n, denominator: B, denominatorType: "respondents", quantity: proportion(n / B) });
  return { id, kind: "semantic_grouping", claim: "construct unverified", sourceQuestionKeys: [qa, qb], evidence: [ev(qa, "a", 80), ev(qb, "b", 60)], results: [{ id: `${id}#grp`, operation: "grouping", quantity: proportion(140 / B), numerator: 140, denominator: B, components: [`${qa}:a`, `${qb}:b`], grouping: { kind: "governed_semantic", componentLabels: ["A", "B"], parentConstruct: "construct unverified" } }], provenance: { generator: "external-model", deterministic: false, modelProposed: true }, reviewRequirements: ["semantic_construct"], state: "held_for_semantic_review" };
}
const question = (id: string, semantics?: QuestionSemantics) => ({ questionKey: `q_${id}`, questionText: "Qx", base: B, options: [{ id: "a", count: 80 }, { id: "b", count: 60 }], semantics });
const sem = (id: string, a: string, b: string, prov: "source_declared" | "governed_imported" | "analytically_proposed" = "source_declared"): QuestionSemantics => ({ questionKey: `q_${id}`, scaleType: "nominal", provenance: prov, options: [{ optionId: "a", constructId: a }, { optionId: "b", constructId: b }] });
const runG = (id: string, opts: PipelineOptions, semantics?: QuestionSemantics) => runAnalysis({ questions: [question(id, semantics)], objective: OBJ } as DiscoveryInput, { ...opts, externalCandidates: [grouping(id), ...(opts.externalCandidates ?? [])] }).outcomes.find((o) => o.candidate.id === id)!;
const interpOf = (o: { candidate: Candidate }) => (o.candidate.results ?? []).map((r) => r.interpretation).find(Boolean);
const strongRank = (f: Finding, mat: "critical" | "low" = "critical", rel: "high" | "low" = "high"): RankingInput => ({
  eligibility: { level: "eligible", reasons: [], caveats: [], governanceIssueIds: [], assessor: "deterministic" },
  confidence: { level: "high", reasons: [], constraints: [], assessor: "deterministic" },
  materiality: { level: mat, reasons: [], constraints: [], assessor: "deterministic", modelAssistedNeeded: [] },
  relevance: { level: rel, reasons: [], assessor: "deterministic" },
  redundancy: { subsumedBy: null, kind: "none", reason: null, semanticReviewNeeded: false },
  finding: f,
});

// ── A. Result ≠ Interpretation ─────────────────────────────────────────────────
test("A: a Result stays numerically intact whether its interpretation is derived, provisional or rejected", () => {
  const derived = runG("a1", { groupingProposer: new FixtureGroupingProposer({ a1: propose() }) }, sem("a1", "x", "x"));
  const provisional = runG("a2", { groupingProposer: new FixtureGroupingProposer({ a2: propose() }) });
  const rejected = runG("a3", { groupingProposer: new FixtureGroupingProposer({ a3: propose() }) }, sem("a3", "x", "y"));
  for (const o of [derived, provisional, rejected]) {
    const gr = o.candidate.results!.find((r) => r.grouping)!;
    assert.equal(gr.quantity.value, 0.7);           // 140/200 — untouched
    assert.equal(gr.numerator, 140);
    assert.deepEqual(gr.components?.length, 2);
    assert.equal(o.candidate.evidence.length, 2);    // lineage intact
  }
  assert.equal(interpOf(derived)!.authority, "derived");
  assert.equal(interpOf(provisional)!.authority, "provisional");
  assert.equal(interpOf(rejected)!.decision, "rejected");
});

test("A: a synthesis never produces a numeric Result", () => {
  const input: DiscoveryInput = { questions: [question("as1"), question("as2")], objective: OBJ };
  const o = runAnalysis(input, { synthesisProposals: [{ id: "syn", claim: "story", construct: "c", questionKeys: ["q_as1", "q_as2"], componentCandidateIds: ["q_as1#lead", "q_as2#lead"] }], synthesisProposer: new FixtureSynthesisProposer({ syn: { formsStory: true, ambiguity: "low", rationale: [] } }) }).outcomes.find((o2) => o2.candidate.id === "syn")!;
  assert.ok(!(o.candidate.results ?? []).some((r) => !!r.quantity));
});

// ── B. Model ≠ Authority ───────────────────────────────────────────────────────
test("B: a model proposal creates at most PROVISIONAL; abstention creates nothing", () => {
  const p = runG("b1", { groupingProposer: new FixtureGroupingProposer({ b1: propose() }) });
  assert.equal(interpOf(p)!.authority, "provisional");
  assert.equal(interpOf(p)!.provenance, "model_proposed");
  const a = runG("b2", { groupingProposer: new FixtureGroupingProposer({}) }); // abstain
  assert.equal(a.finalState, "held_for_semantic_review");
  assert.equal(interpOf(a), undefined);
});

test("B: a PROVISIONAL novel quantitative construct is capped at Contextual under every strong signal", () => {
  const provisional: Finding = { id: "p", statement: "s", evidence: [{ id: "e", kind: "base", sourceType: "survey", sourceId: "s", denominator: 274 }], results: [{ id: "grp", operation: "grouping", quantity: proportion(0.7), statisticalAssessment: { status: "supported" } as never, grouping: { kind: "governed_semantic", componentLabels: ["A", "B"], parentConstruct: "c" }, interpretation: { id: "i", label: "l", decision: "approved", authority: "provisional", provenance: "model_proposed", reviewRequired: true, caveats: [] } }], version: V, status: "candidate" };
  assert.equal(assignPriority(strongRank(provisional)).priority, "contextual"); // base/conf/mat/rel/stat all strong
});

test("B: no confidence-like model wording upgrades authority (provenance cap holds)", () => {
  assert.equal(authorityWithinProvenance("derived", "model_proposed"), false);
  assert.equal(authorityWithinProvenance("declared", "model_proposed"), false);
  assert.equal(authorityWithinProvenance("attested", "model_proposed"), false);
});

// ── C. Metadata ≠ Authority ────────────────────────────────────────────────────
test("C: constructId alone / analytically-proposed / missing metadata never yield DERIVED", () => {
  assert.equal(interpOf(runG("c1", { groupingProposer: new FixtureGroupingProposer({ c1: propose() }) }, sem("c1", "x", "x", "analytically_proposed")))!.authority, "provisional");
  assert.equal(interpOf(runG("c2", { groupingProposer: new FixtureGroupingProposer({ c2: propose() }) }))!.authority, "provisional"); // no metadata
  assert.equal(assessEntailment([{ questionKey: "q", optionId: "a" }], () => undefined).decision, "unable_to_establish");
});

// ── D. Deterministic entailment is authoritative ───────────────────────────────
test("D: same governed construct → DERIVED with the model NOT called", () => {
  let calls = 0;
  const spy: SemanticGroupingProposer = { propose() { calls++; return propose(); } };
  const o = runG("d1", { groupingProposer: spy }, sem("d1", "x", "x"));
  assert.equal(interpOf(o)!.authority, "derived");
  assert.equal(interpOf(o)!.provenance, "deterministic_recode");
  assert.equal(calls, 0);
});

test("D: different governed constructs → rejected; model approval cannot override", () => {
  const o = runG("d2", { groupingProposer: new FixtureGroupingProposer({ d2: propose() }) }, sem("d2", "x", "y"));
  assert.equal(o.finalState, "rejected");
});

test("D: same constructId but a claimed narrower construct is NOT derived", () => {
  const r = assessEntailment([{ questionKey: "q", optionId: "a" }, { questionKey: "q", optionId: "b" }], semFor({ q: sem("", "x", "x") }), "narrower");
  assert.equal(r.decision, "unable_to_establish");
});

test("D: DERIVED removes only the ceiling — it does not boost materiality/priority", () => {
  const f: Finding = { id: "d", statement: "s", evidence: [{ id: "e", kind: "base", sourceType: "survey", sourceId: "s", denominator: 274 }], results: [{ id: "g", operation: "grouping", quantity: proportion(0.7), grouping: { kind: "governed_semantic", componentLabels: ["A", "B"], parentConstruct: "x" }, interpretation: { id: "i", label: "l", construct: "x", decision: "approved", authority: "derived", provenance: "deterministic_recode", reviewRequired: false, caveats: [] } }], version: V, status: "candidate" };
  assert.equal(constructAuthorityOf(f), "derived");
  assert.equal(AUTHORITY_CEILING.derived, "primary");
  assert.equal(assignPriority(strongRank(f, "critical", "high")).priority, "primary"); // reaches primary ON MERIT
  assert.notEqual(assignPriority(strongRank(f, "low", "low")).priority, "primary");     // weak stays low
});

// ── E. Structure precedes semantics ────────────────────────────────────────────
test("E: a cross-question grouping fails structurally BEFORE entailment or the model", () => {
  let calls = 0;
  const spy: SemanticGroupingProposer = { propose() { calls++; return propose(); } };
  const o = runG("e1", { groupingProposer: spy, externalCandidates: [grouping("e1", true)] }, sem("e1", "x", "x"));
  void o;
  const xq = runAnalysis({ questions: [], objective: OBJ }, { groupingProposer: spy, externalCandidates: [grouping("e1", true)] }).outcomes.find((o2) => o2.candidate.id === "e1")!;
  assert.equal(xq.finalState, "rejected");
  assert.equal(calls, 0); // neither entailment (no metadata for these keys) nor the model produced authority
});

// ── F. Synthesis is separately governed ────────────────────────────────────────
test("F: model-only synthesis is never Primary; a causal synthesis without behavioural evidence is held", () => {
  const input: DiscoveryInput = { questions: [{ questionKey: "f1", questionText: "f1", base: 274, sourceType: "survey", contribution: "elicited_perception", options: [{ id: "x", count: 150 }, { id: "y", count: 60 }, { id: "z", count: 64 }] }, { questionKey: "f2", questionText: "f2", base: 274, sourceType: "survey", contribution: "elicited_perception", options: [{ id: "x", count: 130 }, { id: "y", count: 80 }, { id: "z", count: 64 }] }], objective: OBJ };
  const formsStory = new FixtureSynthesisProposer({ syn: { formsStory: true, ambiguity: "low", rationale: [] } });
  const descriptive = runAnalysis(input, { synthesisProposals: [{ id: "syn", claim: "value story", construct: "value", questionKeys: ["f1", "f2"], componentCandidateIds: ["f1#lead", "f2#lead"] }], synthesisProposer: formsStory }).outcomes.find((o) => o.candidate.id === "syn")!;
  assert.notEqual(descriptive.priority, "primary");
  const causal = runAnalysis(input, { synthesisProposals: [{ id: "syn", claim: "x causes y", construct: "c", questionKeys: ["f1", "f2"], componentCandidateIds: ["f1#lead", "f2#lead"], claimType: "causal" }], synthesisProposer: formsStory }).outcomes.find((o) => o.candidate.id === "syn")!;
  assert.equal(causal.finalState, "held_for_semantic_review");
});

// ── G. Disconfirmation is claim-level ──────────────────────────────────────────
const dis = (status: DisconfirmationStatus, kinds: DisconfirmationKind[]): DisconfirmationAssessment => ({ status, kinds, evidenceIds: [], reasons: ["r"], reviewRequired: false, assessor: "deterministic" });
test("G: interpretation/causal challenges caveat only; core-observation contradiction suppresses; none_found no boost", () => {
  assert.equal(disconfirmationEffect(dis("materially_weakened", ["alternative_explanation"])).demoteTo, null);
  assert.equal(disconfirmationEffect(dis("materially_weakened", ["construct_mismatch"])).demoteTo, null);
  assert.equal(disconfirmationEffect(dis("materially_weakened", ["weak_magnitude"])).demoteTo, "contextual");
  assert.equal(disconfirmationEffect(dis("contradicted", ["direct_contradiction"])).suppress, true);
  assert.equal(disconfirmationEffect(dis("contradicted", ["alternative_explanation"])).suppress, false);
  const clean = disconfirmationEffect(dis("none_found", []));
  assert.equal(clean.suppress, false); assert.equal(clean.demoteTo, null);
});

// ── H. Ordinary findings remain ordinary ───────────────────────────────────────
test("H: a simple descriptive Finding (no interpretation) can rank Primary; missing authority ≠ provisional", () => {
  const f: Finding = { id: "h", statement: "Rewards leads by a clear margin.", evidence: [{ id: "e", kind: "base", sourceType: "survey", sourceId: "s", denominator: 274 }], results: [{ id: "cmp", operation: "comparison", quantity: proportion(0.15) }], version: V, status: "candidate" };
  assert.equal(constructAuthorityOf(f), undefined); // NOT provisional
  assert.equal(assignPriority(strongRank(f, "critical", "high")).priority, "primary");
});

// ── I. Product-agnostic ────────────────────────────────────────────────────────
test("I: no evidence type gains authority from a model proposal (survey/social/document/qualitative/campaign)", () => {
  const types: { st: "survey" | "conversation" | "document"; contribution: "elicited_perception" | "unprompted_discourse" | "documented_activity" | "interested_claim" }[] = [
    { st: "survey", contribution: "elicited_perception" },
    { st: "conversation", contribution: "unprompted_discourse" },
    { st: "document", contribution: "interested_claim" },
    { st: "conversation", contribution: "documented_activity" },
  ];
  for (const [i, t] of types.entries()) {
    const base = 300;
    const ev = (oid: string, n: number): Evidence => ({ id: `qz${i}:${oid}`, kind: "base", contribution: t.contribution, sourceType: t.st, sourceId: "s", question: { canonicalKey: `qz${i}` }, option: { id: oid }, numerator: n, denominator: base, denominatorType: "respondents", quantity: proportion(n / base) });
    const cand: Candidate = { id: `pz${i}`, kind: "semantic_grouping", claim: "construct unverified", sourceQuestionKeys: [`qz${i}`], evidence: [ev("a", 120), ev("b", 90)], results: [{ id: "g", operation: "grouping", quantity: proportion(0.7), components: [`qz${i}:a`, `qz${i}:b`], grouping: { kind: "governed_semantic", componentLabels: ["A", "B"], parentConstruct: "construct unverified" } }], provenance: { generator: "external-model", deterministic: false, modelProposed: true }, reviewRequirements: ["semantic_construct"], state: "held_for_semantic_review" };
    const o = runAnalysis({ questions: [], objective: OBJ }, { groupingProposer: new FixtureGroupingProposer({ [`pz${i}`]: propose() }), externalCandidates: [cand] }).outcomes.find((x) => x.candidate.id === `pz${i}`)!;
    const interp = (o.candidate.results ?? []).map((r) => r.interpretation).find(Boolean);
    assert.equal(interp!.authority, "provisional", `${t.st}/${t.contribution} must stay provisional`);
    assert.notEqual(o.priority, "primary");
  }
});

test("I: a temporal/change synthesis needs governed change state; a causal one needs behavioural evidence", () => {
  const input: DiscoveryInput = { questions: [{ questionKey: "s1", questionText: "s1", base: 500, sourceType: "conversation", contribution: "unprompted_discourse", options: [{ id: "x", count: 300 }, { id: "y", count: 200 }] }, { questionKey: "s2", questionText: "s2", base: 500, sourceType: "conversation", contribution: "unprompted_discourse", options: [{ id: "x", count: 320 }, { id: "y", count: 180 }] }], objective: OBJ };
  const o = runAnalysis(input, { synthesisProposals: [{ id: "syn", claim: "sentiment shifted over time", construct: "shift", questionKeys: ["s1", "s2"], componentCandidateIds: ["s1#lead", "s2#lead"], claimType: "temporal" }], synthesisProposer: new FixtureSynthesisProposer({ syn: { formsStory: true, ambiguity: "low", rationale: [] } }) }).outcomes.find((o2) => o2.candidate.id === "syn")!;
  assert.equal(o.finalState, "held_for_semantic_review"); // no governed comparable change
});

// ── Original-failure-mode regression + eligibility ─────────────────────────────
test("REGRESSION: the Stage 5 failure cannot recur (invalid relabel never Primary; governed recode DERIVED w/o model)", () => {
  // (1) An arithmetically-valid but cross-construct relabel, model-approved, is rejected — never surfaced.
  const relabel = runG("r1", { groupingProposer: new FixtureGroupingProposer({ r1: propose("one construct") }) }, sem("r1", "clarity", "awareness"));
  assert.equal(relabel.finalState, "rejected");
  // (2) The same relabel with NO governed metadata stays provisional/contextual — never Primary.
  const modelOnly = runG("r2", { groupingProposer: new FixtureGroupingProposer({ r2: propose() }) });
  assert.equal(interpOf(modelOnly)!.authority, "provisional");
  assert.equal(interpOf(modelOnly)!.reviewRequired, true); // model cannot clear its own review
  assert.equal(modelOnly.priority, "contextual");
  // (3) A legitimate governed same-construct recode becomes DERIVED without the model.
  let calls = 0;
  const spy: SemanticGroupingProposer = { propose() { calls++; return propose(); } };
  const recode = runG("r3", { groupingProposer: spy }, sem("r3", "relevance", "relevance"));
  assert.equal(interpOf(recode)!.authority, "derived");
  assert.equal(calls, 0);
});

test("REGRESSION: a legacy model verdict (humanReviewRequired=false) cannot become authoritative", () => {
  const coherent: GroupingVerdict = { constructCoherent: "yes", labelFaithful: "yes", informationGain: "yes", competingRisk: "low", humanReviewRequired: false, construct: "c", reasons: [] };
  const o = runG("r4", { groupingProposer: new FixtureGroupingProposer({ r4: verdictToProposal(coherent) }) });
  assert.equal(interpOf(o)!.authority, "provisional"); // adapter dropped humanReviewRequired
});

test("eligibility: DERIVED drops the semantic-review caveat; PROVISIONAL keeps it", () => {
  const derivedF: Finding = { id: "d", statement: "s", evidence: [{ id: "e", kind: "base", sourceType: "survey", sourceId: "s", denominator: 274 }], results: [{ id: "g", operation: "grouping", quantity: proportion(0.7), grouping: { kind: "governed_semantic", componentLabels: ["A", "B"], parentConstruct: "x" }, interpretation: { id: "i", label: "l", decision: "approved", authority: "derived", provenance: "deterministic_recode", reviewRequired: false, caveats: [] } }], version: V, status: "candidate" };
  assert.equal(assessEligibility(derivedF).caveats.some((c) => /requires model\/human review/i.test(c)), false);
  const provF: Finding = { ...derivedF, id: "p", results: [{ ...derivedF.results![0], interpretation: { ...derivedF.results![0].interpretation!, authority: "provisional", provenance: "model_proposed" } }] };
  assert.equal(assessEligibility(provF).caveats.some((c) => /requires model\/human review/i.test(c)), true);
});

// ── Determinism / repeatability ────────────────────────────────────────────────
test("REPEATABILITY: identical fixture input yields byte-identical outcomes across runs", () => {
  const build = () => {
    const input: DiscoveryInput = { questions: [question("rp1", sem("rp1", "x", "x")), question("rp2"), { questionKey: "rp3", questionText: "rp3", base: 274, sourceType: "survey", contribution: "elicited_perception", options: [{ id: "x", count: 150 }, { id: "y", count: 60 }, { id: "z", count: 64 }] }], objective: OBJ };
    const opts: PipelineOptions = { groupingProposer: new FixtureGroupingProposer({ rp1: propose(), rp2: propose() }), synthesisProposals: [{ id: "syn", claim: "story", construct: "c", questionKeys: ["rp1", "rp3"], componentCandidateIds: ["rp3#lead"] }], synthesisProposer: new FixtureSynthesisProposer({ syn: { formsStory: true, ambiguity: "low", rationale: [] } }), externalCandidates: [grouping("rp2")] };
    const r = runAnalysis(input, opts);
    return JSON.stringify({
      outcomes: r.outcomes.map((o) => ({ id: o.candidate.id, state: o.finalState, prio: o.priority, auth: constructAuthorityOf({ results: o.candidate.results } as Finding), reason: o.decisionReason })),
      hierarchy: Object.fromEntries(Object.entries(r.hierarchy).map(([k, v]) => [k, v.map((a) => a.findingId)])),
    });
  };
  assert.equal(build(), build());
});

// ── Version / audit ────────────────────────────────────────────────────────────
test("AUDIT: the interpretation schema version is stamped on DERIVED interpretations", () => {
  const o = runG("v1", { groupingProposer: new FixtureGroupingProposer({ v1: propose() }) }, sem("v1", "x", "x"));
  assert.equal(interpOf(o)!.derivation?.schemaVersion, "interpretation_v1");
});

// ── Ordinal interaction coverage (Stage 5R.9R) ─────────────────────────────────
test("ORDINAL: governed threshold recodes generate → DERIVED (no model); invalid ordinal combos never DERIVED; deterministic", () => {
  const ord: QuestionSemantics = { questionKey: "sat", scaleType: "ordinal", provenance: "source_declared", options: [
    { optionId: "vs", constructId: "s", ordinalPosition: 4, polarity: "positive" }, { optionId: "s", constructId: "s", ordinalPosition: 3, polarity: "positive" },
    { optionId: "d", constructId: "s", ordinalPosition: 2, polarity: "negative" }, { optionId: "vd", constructId: "s", ordinalPosition: 1, polarity: "negative" },
  ] };
  const input: DiscoveryInput = { questions: [{ questionKey: "sat", questionText: "sat", base: 100, sourceType: "survey", contribution: "elicited_perception", options: [{ id: "vs", count: 30 }, { id: "s", count: 35 }, { id: "d", count: 20 }, { id: "vd", count: 15 }], semantics: ord }], objective: OBJ };
  let called = 0;
  const spy: SemanticGroupingProposer = { propose() { called++; return propose(); } };
  const build = () => {
    const r = runAnalysis(input, { groupingProposer: spy });
    const byId = new Map(r.outcomes.map((o) => [o.candidate.id, o]));
    const auth = (id: string) => (byId.get(id)?.candidate.results ?? []).map((x) => x.interpretation).find(Boolean)?.authority;
    return { top: auth("sat#topbox"), bottom: auth("sat#bottombox"), hierarchy: r.hierarchy.primary.map((a) => a.findingId) };
  };
  const a = build();
  assert.equal(a.top, "derived");        // upper threshold governed → DERIVED
  assert.equal(a.bottom, "derived");     // lower threshold governed → DERIVED
  assert.equal(called, 0);               // fully governed → model not called
  assert.deepEqual(build(), a);          // deterministic across runs
});
