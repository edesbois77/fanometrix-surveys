// ── Stage 5D — governed semantics: snapshot → adapter → Core DERIVED (pure) ──
// Proves the NEW transport link end-to-end WITHOUT weakening any Stage 5R rule:
// governed instrument semantics flow snapshot → StudioGovernedInput →
// QuestionDistribution.semantics → deterministic entailment → DERIVED, with the
// semantic MODEL never consulted; and that missing / arbitrary semantics never derive.
import { test } from "node:test";
import assert from "node:assert/strict";
import { studioEvidenceToGovernedInput, type StudioEvidenceSnapshot } from "./studio-evidence-adapter";
import { studioToDiscoveryInput } from "./adapter";
import { runAnalysis } from "../pipeline/analyse";
import type { SemanticGroupingProposer } from "../semantic/grouping";

// A governed 4-point satisfaction question (top-box = options 1+2, base 200, strong).
function satisfactionSnapshot(opts?: { dropPolarity?: boolean; dropConstruct?: boolean; nominal?: boolean }): StudioEvidenceSnapshot {
  const base = 200;
  const rows = [
    { optionId: "1", optionLabel: "Very satisfied", count: 80, ordinalPosition: 4, polarity: "positive" as const },
    { optionId: "2", optionLabel: "Satisfied", count: 70, ordinalPosition: 3, polarity: "positive" as const },
    { optionId: "3", optionLabel: "Dissatisfied", count: 30, ordinalPosition: 2, polarity: "negative" as const },
    { optionId: "4", optionLabel: "Very dissatisfied", count: 20, ordinalPosition: 1, polarity: "negative" as const },
  ];
  return {
    study: { id: "SURVEY-X", objective: "Assess satisfaction" },
    evidence: rows.map((r) => ({
      canonicalQuestionKey: "q1", question: "How satisfied are you?", scope: "combined",
      optionId: r.optionId, optionLabel: r.optionLabel, count: r.count, base,
      ...(opts?.nominal ? { scaleType: "nominal" as const } : { scaleType: "ordinal" as const }),
      ...(opts?.dropConstruct ? {} : { constructKey: "satisfaction" }),
      ...(opts?.dropPolarity ? {} : { polarity: r.polarity }),
      ordinalPosition: r.ordinalPosition,
    })),
  };
}

// A spy proposer: records every model call so we can prove the deterministic path skips it.
function spyProposer(): SemanticGroupingProposer & { calls: number } {
  const s = { calls: 0, propose() { s.calls++; return { candidateId: "x", proposedConstruct: "model-construct", rationale: [], ambiguity: "low" as const }; } };
  return s as never;
}
const topboxOutcome = (r: ReturnType<typeof runAnalysis>) => r.outcomes.find((o) => o.candidate.id.endsWith("#topbox"));
const interpOf = (o: { candidate: { results?: Array<{ interpretation?: unknown }> } } | undefined) =>
  (o?.candidate.results ?? []).map((x) => x.interpretation).find(Boolean) as { authority?: string; decision?: string } | undefined;

test("§10 governed ordinal metadata reaches QuestionSemantics + QuestionDistribution.semantics", () => {
  const input = studioEvidenceToGovernedInput(satisfactionSnapshot(), { kind: "survey", id: "SURVEY-X" });
  const q = input.questions[0];
  assert.ok(q.semantics, "semantics attached");
  assert.equal(q.semantics!.scaleType, "ordinal");
  assert.equal(q.semantics!.constructId, "q1::satisfaction", "constructId namespaced per question");
  assert.equal(q.semantics!.provenance, "source_declared");
  assert.deepEqual(q.semantics!.options.find((o) => o.optionId === "1"), { optionId: "1", ordinalPosition: 4, polarity: "positive" });
  const disc = studioToDiscoveryInput(input);
  assert.equal(disc.questions[0].semantics?.scaleType, "ordinal");
});

test("§11/§12/§13 legitimate governed threshold recode → DERIVED, and the model is NOT called", () => {
  const spy = spyProposer();
  const input = studioEvidenceToGovernedInput(satisfactionSnapshot(), { kind: "survey", id: "SURVEY-X" });
  const result = runAnalysis(studioToDiscoveryInput(input), { groupingProposer: spy });
  const interp = interpOf(topboxOutcome(result));
  assert.ok(interp, "top-box interpretation present");
  assert.equal(interp!.authority, "derived", "governed threshold recode is DERIVED");
  assert.equal(interp!.decision, "approved");
  assert.equal(spy.calls, 0, "deterministic entailment path never consulted the model");
});

test("§7/§11 missing CONSTRUCT ⇒ unable ⇒ not DERIVED (model may propose → provisional at most)", () => {
  const spy = spyProposer();
  const input = studioEvidenceToGovernedInput(satisfactionSnapshot({ dropConstruct: true }), { kind: "survey", id: "S" });
  const result = runAnalysis(studioToDiscoveryInput(input), { groupingProposer: spy });
  const interp = interpOf(topboxOutcome(result));
  assert.notEqual(interp?.authority, "derived", "no construct ⇒ never DERIVED");
});

test("§7 missing POLARITY ⇒ no governed threshold candidate is even generated (nothing to derive)", () => {
  const input = studioEvidenceToGovernedInput(satisfactionSnapshot({ dropPolarity: true }), { kind: "survey", id: "S" });
  const result = runAnalysis(studioToDiscoveryInput(input), { groupingProposer: spyProposer() });
  assert.equal(topboxOutcome(result), undefined, "no polarity region ⇒ no #topbox candidate");
});

test("§14 a NOMINAL question is not treated as ordinal (no governed threshold recode)", () => {
  const input = studioEvidenceToGovernedInput(satisfactionSnapshot({ nominal: true }), { kind: "survey", id: "S" });
  assert.equal(input.questions[0].semantics?.scaleType, "nominal");
  const result = runAnalysis(studioToDiscoveryInput(input), { groupingProposer: spyProposer() });
  assert.equal(topboxOutcome(result), undefined, "nominal ⇒ no ordinal threshold recode");
});

test("§8 a historic snapshot with NO semantic fields yields NO semantics (backwards compatible)", () => {
  const legacy: StudioEvidenceSnapshot = {
    study: { id: "OLD", objective: null },
    evidence: [
      { canonicalQuestionKey: "q1", question: "Pick one", scope: "combined", optionId: "1", optionLabel: "A", count: 50, base: 100 },
      { canonicalQuestionKey: "q1", question: "Pick one", scope: "combined", optionId: "2", optionLabel: "B", count: 50, base: 100 },
    ],
  };
  const input = studioEvidenceToGovernedInput(legacy, { kind: "survey", id: "OLD" });
  assert.equal(input.questions[0].semantics, undefined, "no governed semantics on a pre-5D snapshot");
});
