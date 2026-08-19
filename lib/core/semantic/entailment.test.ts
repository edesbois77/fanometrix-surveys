// ── Stage 5R.4 — deterministic entailment + DERIVED authority (no FedEx) ────────
// DERIVED authority may be granted ONLY where governed metadata deterministically
// entails the interpretation; a model verdict can neither create nor override it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assessEntailment, buildDerivedInterpretation } from "./entailment";
import type { QuestionSemantics } from "./metadata";
import { constructAuthorityOf } from "./interpretation";
import { AUTHORITY_CEILING, authorityWithinProvenance, SEMANTIC_SCHEMA_VERSION } from "./authority";
import { runAnalysis } from "../pipeline/analyse";
import { assignPriority, type RankingInput } from "../assessment/ranking";
import { assessEligibility } from "../assessment/eligibility";
import { FixtureGroupingProposer, type GroupingProposal, type SemanticGroupingProposer } from "./grouping";
import { proportion } from "../evidence/scale";
import type { Candidate, DiscoveryInput } from "../candidates/types";
import type { Evidence } from "../evidence/types";
import type { Finding } from "../findings/types";

const OBJ = "Understand fan value and access preferences.";
const propose = (): GroupingProposal => ({ proposedConstruct: "model label", proposedLabel: "model label", ambiguity: "low", competingInterpretations: false, rationale: [] });

// A structurally-valid same-question 2-option grouping over question `q_<id>`.
function grouping(id: string): Candidate {
  const base = 200;
  const ev = (oid: string, n: number): Evidence => ({ id: `q_${id}:${oid}`, kind: "base", contribution: "elicited_perception", sourceType: "survey", sourceId: "s", question: { canonicalKey: `q_${id}`, text: "Qx" }, option: { id: oid, label: oid }, numerator: n, denominator: base, denominatorType: "respondents", quantity: proportion(n / base) });
  return { id, kind: "semantic_grouping", claim: "construct unverified", sourceQuestionKeys: [`q_${id}`], evidence: [ev("a", 80), ev("b", 60)], results: [{ id: `${id}#grp`, operation: "grouping", quantity: proportion(140 / base), components: [`q_${id}:a`, `q_${id}:b`], grouping: { kind: "governed_semantic", componentLabels: ["A", "B"], parentConstruct: "construct unverified" } }], provenance: { generator: "external-model", deterministic: false, modelProposed: true }, reviewRequirements: ["semantic_construct"], state: "held_for_semantic_review" };
}
// A question distribution matching q_<id>, optionally with governed semantics.
function question(id: string, semantics?: QuestionSemantics) {
  return { questionKey: `q_${id}`, questionText: "Qx", base: 200, options: [{ id: "a", count: 80 }, { id: "b", count: 60 }], semantics };
}
const sem = (id: string, aCon: string, bCon: string, prov: "source_declared" | "governed_imported" | "analytically_proposed" = "source_declared"): QuestionSemantics =>
  ({ questionKey: `q_${id}`, scaleType: "nominal", provenance: prov, options: [{ optionId: "a", constructId: aCon, ordinalPosition: 2 }, { optionId: "b", constructId: bCon, ordinalPosition: 1 }] });
const semanticsFor = (m: Record<string, QuestionSemantics>) => (qk: string) => m[qk];

// ── Entailment engine (unit) ───────────────────────────────────────────────────
test("entailment: same governed construct → entailed", () => {
  const r = assessEntailment([{ questionKey: "q", optionId: "a" }, { questionKey: "q", optionId: "b" }], semanticsFor({ q: { questionKey: "q", scaleType: "nominal", provenance: "source_declared", options: [{ optionId: "a", constructId: "relevance" }, { optionId: "b", constructId: "relevance" }] } }));
  assert.equal(r.decision, "entailed");
  assert.equal(r.constructId, "relevance");
});

test("entailment: different governed constructs → not_entailed (cross-construct substitution)", () => {
  const r = assessEntailment([{ questionKey: "q", optionId: "a" }, { questionKey: "q", optionId: "b" }], semanticsFor({ q: { questionKey: "q", scaleType: "nominal", provenance: "source_declared", options: [{ optionId: "a", constructId: "relevance" }, { optionId: "b", constructId: "awareness" }] } }));
  assert.equal(r.decision, "not_entailed");
  assert.deepEqual(r.reasons, ["different_governed_constructs"]);
});

test("entailment: missing metadata → unable_to_establish", () => {
  const r = assessEntailment([{ questionKey: "q", optionId: "a" }, { questionKey: "q", optionId: "b" }], () => undefined);
  assert.equal(r.decision, "unable_to_establish");
  assert.deepEqual(r.reasons, ["metadata_absent"]);
});

test("entailment: analytically_proposed metadata cannot establish authority → unable", () => {
  const r = assessEntailment([{ questionKey: "q", optionId: "a" }, { questionKey: "q", optionId: "b" }], semanticsFor({ q: { questionKey: "q", scaleType: "nominal", provenance: "analytically_proposed", options: [{ optionId: "a", constructId: "relevance" }, { optionId: "b", constructId: "relevance" }] } }));
  assert.equal(r.decision, "unable_to_establish");
  assert.deepEqual(r.reasons, ["metadata_not_governed"]);
});

test("entailment (label safety §22): same construct but a claimed NARROWER construct → unable, not derived", () => {
  const r = assessEntailment([{ questionKey: "q", optionId: "a" }, { questionKey: "q", optionId: "b" }], semanticsFor({ q: { questionKey: "q", scaleType: "nominal", provenance: "source_declared", options: [{ optionId: "a", constructId: "satisfaction" }, { optionId: "b", constructId: "satisfaction" }] } }), "strong_satisfaction");
  assert.equal(r.decision, "unable_to_establish");
  assert.deepEqual(r.reasons, ["label_exceeds_governed_semantics"]);
});

test("the DERIVED interpretation records its audit trail and respects provenance", () => {
  const e = assessEntailment([{ questionKey: "q", optionId: "a" }, { questionKey: "q", optionId: "b" }], semanticsFor({ q: { questionKey: "q", scaleType: "nominal", provenance: "source_declared", options: [{ optionId: "a", constructId: "relevance" }, { optionId: "b", constructId: "relevance" }] } }));
  const i = buildDerivedInterpretation("c", e);
  assert.equal(i.authority, "derived");
  assert.equal(i.provenance, "deterministic_recode");
  assert.equal(i.reviewRequired, false);
  assert.equal(authorityWithinProvenance(i.authority, i.provenance), true); // derived is within deterministic_recode
  assert.deepEqual(i.derivation?.componentIds, ["q:a", "q:b"]);
  assert.equal(i.derivation?.schemaVersion, SEMANTIC_SCHEMA_VERSION);
});

// ── Pipeline: DERIVED grant, no ceiling; cross-construct rejected ──────────────
test("A: a same-construct governed grouping becomes DERIVED via deterministic entailment (no model)", () => {
  let judged = 0;
  const spy: SemanticGroupingProposer = { propose() { judged++; return propose(); } };
  const input: DiscoveryInput = { questions: [question("g", sem("g", "relevance", "relevance"))], objective: OBJ };
  const o = runAnalysis(input, { groupingProposer: spy, externalCandidates: [grouping("g")] }).outcomes.find((x) => x.candidate.id === "g")!;
  const interp = o.candidate.results!.find((r) => r.interpretation)!.interpretation!;
  assert.equal(interp.authority, "derived");
  assert.equal(interp.provenance, "deterministic_recode");
  assert.equal(judged, 0); // model NOT consulted for a deterministically-derived grouping
});

test("B: a different-construct governed grouping is deterministically rejected; the Result stays valid; model cannot override", () => {
  const spy: SemanticGroupingProposer = { propose: () => propose() }; // model would propose — must not matter
  const input: DiscoveryInput = { questions: [question("x", sem("x", "relevance", "awareness"))], objective: OBJ };
  const o = runAnalysis(input, { groupingProposer: spy, externalCandidates: [grouping("x")] }).outcomes.find((z) => z.candidate.id === "x")!;
  assert.equal(o.finalState, "rejected");
  const gr = o.candidate.results!.find((r) => r.grouping)!;
  assert.equal(gr.quantity.value, 0.7); // arithmetic untouched (140/200)
  assert.equal(gr.interpretation!.decision, "rejected");
});

test("C: no metadata → grouping falls back to the model path and stays PROVISIONAL / Contextual", () => {
  const input: DiscoveryInput = { questions: [question("h")], objective: OBJ }; // no semantics
  const o = runAnalysis(input, { groupingProposer: new FixtureGroupingProposer({ h: propose() }), externalCandidates: [grouping("h")] }).outcomes.find((z) => z.candidate.id === "h")!;
  assert.equal(o.candidate.results!.find((r) => r.interpretation)!.interpretation!.authority, "provisional");
  assert.equal(o.priority, "contextual");
});

test("D: analytically-proposed metadata cannot grant DERIVED (stays provisional)", () => {
  const input: DiscoveryInput = { questions: [question("p", sem("p", "relevance", "relevance", "analytically_proposed"))], objective: OBJ };
  const o = runAnalysis(input, { groupingProposer: new FixtureGroupingProposer({ p: propose() }), externalCandidates: [grouping("p")] }).outcomes.find((z) => z.candidate.id === "p")!;
  assert.equal(o.candidate.results!.find((r) => r.interpretation)!.interpretation!.authority, "provisional");
  assert.equal(o.priority, "contextual");
});

// ── DERIVED removes the ceiling but confers no importance ──────────────────────
const derivedFinding = (): Finding => ({
  id: "d", statement: "s", evidence: [{ id: "e", kind: "base", sourceType: "survey", sourceId: "s", denominator: 274 }],
  results: [{ id: "grp", operation: "grouping", quantity: proportion(0.7), grouping: { kind: "governed_semantic", componentLabels: ["A", "B"], parentConstruct: "relevance" }, interpretation: buildDerivedInterpretation("d", assessEntailment([{ questionKey: "q", optionId: "a" }, { questionKey: "q", optionId: "b" }], semanticsFor({ q: { questionKey: "q", scaleType: "nominal", provenance: "source_declared", options: [{ optionId: "a", constructId: "relevance" }, { optionId: "b", constructId: "relevance" }] } }))) }],
  version: { standardVersion: "1.2", coreVersion: "0.1.0", runProvenance: null }, status: "candidate",
});
const rank = (f: Finding, mat: "critical" | "low", rel: "high" | "low"): RankingInput => ({
  eligibility: { level: "eligible", reasons: [], caveats: [], governanceIssueIds: [], assessor: "deterministic" },
  confidence: { level: "high", reasons: [], constraints: [], assessor: "deterministic" },
  materiality: { level: mat, reasons: [], constraints: [], assessor: "deterministic", modelAssistedNeeded: [] },
  relevance: { level: rel, reasons: [], assessor: "deterministic" },
  redundancy: { subsumedBy: null, kind: "none", reason: null, semanticReviewNeeded: false },
  finding: f,
});

test("E/F: DERIVED removes the provisional ceiling but does not itself promote (materiality/relevance decide)", () => {
  assert.equal(constructAuthorityOf(derivedFinding()), "derived");
  assert.equal(AUTHORITY_CEILING.derived, "primary"); // ceiling removed
  // F — strong story reaches Primary through ordinary ranking.
  assert.equal(assignPriority(rank(derivedFinding(), "critical", "high")).priority, "primary");
  // E — weak story stays low: DERIVED conferred no importance.
  assert.notEqual(assignPriority(rank(derivedFinding(), "low", "low")).priority, "primary");
});

test("eligibility: DERIVED removes the semantic-review caveat (deterministic derivation established validity)", () => {
  const el = assessEligibility(derivedFinding());
  assert.equal(el.caveats.some((c) => /requires model\/human review/i.test(c)), false);
  assert.equal(el.caveats.some((c) => /provisional/i.test(c)), false);
});
