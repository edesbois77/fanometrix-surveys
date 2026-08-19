// ── Stage 5R.9R — ordinal entailment + governed threshold recodes (abstract) ────
// Generic (NOT NorthAudio): a DERIVED ordinal recode must be a governed THRESHOLD
// region — contiguous positions within one non-neutral polarity (Standard v1.2
// §17.4). Governed threshold recodes are GENERATED from scale semantics, not
// response magnitude. No Benchmark 002 ids/values here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assessEntailment } from "./entailment";
import type { QuestionSemantics } from "./metadata";
import { generateCandidates } from "../candidates/generate";
import { runAnalysis } from "../pipeline/analyse";
import { FixtureGroupingProposer, type SemanticGroupingProposer } from "./grouping";
import type { DiscoveryInput } from "../candidates/types";

const OBJ = "abstract ordinal study";
// A 5-point positive/neutral/negative ordinal scale on one construct.
const scale5: QuestionSemantics = { questionKey: "q", scaleType: "ordinal", provenance: "source_declared", options: [
  { optionId: "p2", constructId: "c", ordinalPosition: 5, polarity: "positive" },
  { optionId: "p1", constructId: "c", ordinalPosition: 4, polarity: "positive" },
  { optionId: "mid", constructId: "c", ordinalPosition: 3, polarity: "neutral" },
  { optionId: "n1", constructId: "c", ordinalPosition: 2, polarity: "negative" },
  { optionId: "n2", constructId: "c", ordinalPosition: 1, polarity: "negative" },
] };
// A 7-point scale (for a non-contiguous same-polarity case).
const scale7: QuestionSemantics = { questionKey: "q", scaleType: "ordinal", provenance: "source_declared", options: [
  { optionId: "a7", constructId: "c", ordinalPosition: 7, polarity: "positive" },
  { optionId: "a6", constructId: "c", ordinalPosition: 6, polarity: "positive" },
  { optionId: "a5", constructId: "c", ordinalPosition: 5, polarity: "positive" },
] };
// A 4-point scale with NO neutral midpoint.
const scale4: QuestionSemantics = { questionKey: "q", scaleType: "ordinal", provenance: "source_declared", options: [
  { optionId: "q4", constructId: "c", ordinalPosition: 4, polarity: "positive" },
  { optionId: "q3", constructId: "c", ordinalPosition: 3, polarity: "positive" },
  { optionId: "q2", constructId: "c", ordinalPosition: 2, polarity: "negative" },
  { optionId: "q1", constructId: "c", ordinalPosition: 1, polarity: "negative" },
] };
const E = (opts: string[], qs: QuestionSemantics) => assessEntailment(opts.map((o) => ({ questionKey: "q", optionId: o })), () => qs);

// ── Valid governed thresholds → entailed (DERIVED) ─────────────────────────────
test("D/E: contiguous single-polarity regions are entailed (upper + lower threshold)", () => {
  assert.equal(E(["p2", "p1"], scale5).decision, "entailed");
  assert.deepEqual(E(["p2", "p1"], scale5).reasons, ["ordinal_recode_entailed"]);
  assert.equal(E(["n1", "n2"], scale5).decision, "entailed"); // lower threshold
  assert.equal(E(["q4", "q3"], scale4).decision, "entailed"); // no-neutral scale, upper
});

// ── Invalid ordinal combinations → not_entailed / unable ───────────────────────
test("C: positive + neutral crosses the neutral boundary → not_entailed", () => {
  const r = E(["p1", "mid"], scale5);
  assert.equal(r.decision, "not_entailed");
  assert.deepEqual(r.reasons, ["crosses_neutral_boundary"]);
});

test("B: opposite poles (non-contiguous) → not_entailed", () => {
  assert.deepEqual(E(["p2", "n2"], scale5).reasons, ["non_contiguous_ordinal_group"]); // positions 5 & 1
});

test("polarity mismatch on an adjacent-but-cross-pole pair (no-neutral scale) → not_entailed", () => {
  const r = E(["q3", "q2"], scale4); // positions 3 & 2, positive & negative
  assert.equal(r.decision, "not_entailed");
  assert.deepEqual(r.reasons, ["polarity_mismatch"]);
});

test("A: non-contiguous same-polarity (7-pt) → not_entailed", () => {
  assert.deepEqual(E(["a7", "a5"], scale7).reasons, ["non_contiguous_ordinal_group"]); // 7 & 5
});

test("F: ordinal + contiguous but NO governed polarity → unable (threshold not governed), never invented", () => {
  const noPolarity: QuestionSemantics = { questionKey: "q", scaleType: "ordinal", provenance: "source_declared", options: [
    { optionId: "a", constructId: "c", ordinalPosition: 5 }, { optionId: "b", constructId: "c", ordinalPosition: 4 },
  ] };
  const r = E(["a", "b"], noPolarity);
  assert.equal(r.decision, "unable_to_establish");
  assert.deepEqual(r.reasons, ["ordinal_threshold_not_governed"]);
});

test("ordinal + missing ordinalPosition → unable (metadata incomplete)", () => {
  const noPos: QuestionSemantics = { questionKey: "q", scaleType: "ordinal", provenance: "source_declared", options: [
    { optionId: "a", constructId: "c", polarity: "positive" }, { optionId: "b", constructId: "c", polarity: "positive" },
  ] };
  assert.deepEqual(E(["a", "b"], noPos).reasons, ["ordinal_metadata_incomplete"]);
});

test("nominal regression: same-construct nominal grouping is still entailed (ordinal logic not applied)", () => {
  const nominal: QuestionSemantics = { questionKey: "q", scaleType: "nominal", provenance: "source_declared", options: [
    { optionId: "a", constructId: "c" }, { optionId: "b", constructId: "c" },
  ] };
  assert.deepEqual(E(["a", "b"], nominal).reasons, ["same_governed_construct"]);
});

// ── Generation: governed threshold recodes from SCALE semantics, not magnitude ──
function ordinalInput(): DiscoveryInput {
  return { questions: [{ questionKey: "q", questionText: "Q", base: 100, sourceType: "survey", contribution: "elicited_perception",
    options: [{ id: "p2", count: 30 }, { id: "p1", count: 35 }, { id: "mid", count: 15 }, { id: "n1", count: 12 }, { id: "n2", count: 8 }], semantics: scale5 }], objective: OBJ };
}

test("generation: an ordinal scale yields governed top-box AND bottom-box candidates (magnitude-independent)", () => {
  const ids = generateCandidates(ordinalInput()).map((c) => c.id);
  assert.ok(ids.includes("q#topbox"));    // positive region
  assert.ok(ids.includes("q#bottombox")); // negative region — generated despite being smaller (20%)
  assert.ok(!ids.includes("q#grouping")); // NOT the magnitude-based top-2 proposal
});

test("generation→entailment: both governed threshold recodes become DERIVED with the model NOT called", () => {
  let called = 0;
  const spy: SemanticGroupingProposer = { propose() { called++; return { proposedConstruct: "x", ambiguity: "low", competingInterpretations: false, rationale: [] }; } };
  const r = runAnalysis(ordinalInput(), { groupingProposer: spy });
  const byId = new Map(r.outcomes.map((o) => [o.candidate.id, o]));
  const auth = (id: string) => (byId.get(id)?.candidate.results ?? []).map((x) => x.interpretation).find(Boolean)?.authority;
  assert.equal(auth("q#topbox"), "derived");
  assert.equal(auth("q#bottombox"), "derived");
  assert.equal(called, 0); // fully governed → no grouping-model call
});

test("generation: an ordinal scale with NO governed polarity yields no threshold candidate (no invention)", () => {
  const noPolInput: DiscoveryInput = { questions: [{ questionKey: "q", questionText: "Q", base: 100, sourceType: "survey", contribution: "elicited_perception",
    options: [{ id: "a", count: 40 }, { id: "b", count: 35 }, { id: "c", count: 25 }],
    semantics: { questionKey: "q", scaleType: "ordinal", provenance: "source_declared", options: [{ optionId: "a", constructId: "c", ordinalPosition: 3 }, { optionId: "b", constructId: "c", ordinalPosition: 2 }, { optionId: "c", constructId: "c", ordinalPosition: 1 }] } }], objective: OBJ };
  const groupings = generateCandidates(noPolInput).filter((c) => c.kind === "semantic_grouping");
  assert.equal(groupings.length, 0);
});
