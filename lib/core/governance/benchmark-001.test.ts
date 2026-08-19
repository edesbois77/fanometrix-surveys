// Additive Benchmark 001 integration: exercise the governance registry against
// the benchmark's MUST-NOT-SAY example claims, WITHOUT modifying the benchmark
// scorer. Only the deterministically/heuristically-detectable violations are
// asserted here; semantic-only failures stay with the benchmark's declared
// lists / model-assisted tier (tiers kept honest). No live AI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateProse } from "./validators";
import type { GovernanceContext } from "./types";
import { loadFedexBenchmark, fedexSourceModel } from "@/lib/intelligence-evals/benchmarks/fedex-ucl-001/benchmark";

const benchmark = loadFedexBenchmark();
const ctx: GovernanceContext = {
  sourceOptions: fedexSourceModel().options,
  governedNumbers: fedexSourceModel().governedNumbers,
};
const claimFor = (id: string) => benchmark.must_not_say.find((r) => r.id === id)?.example_claim ?? "";
const has = (text: string, ruleId: string) => validateProse(text, ctx).some((i) => i.ruleId === ruleId);

test("mns-1 (dominant overstatement) → overstated_leadership", () => {
  assert.ok(has(claimFor("mns-1"), "overstated_leadership"));
});

test("mns-4 (causal / 'because … will improve') → causation flagged", () => {
  assert.ok(has(claimFor("mns-4"), "unsupported_causation"));
});

test("mns-5 (69.3% cross-question sum) → cross_question_arithmetic", () => {
  assert.ok(has(claimFor("mns-5"), "cross_question_arithmetic"));
});

test("mns-8 (aggregate→respondent 'more likely') → aggregate_to_respondent_inference", () => {
  assert.ok(has(claimFor("mns-8"), "aggregate_to_respondent_inference"));
});

test("honesty: semantic-only MUST-NOT-SAY items are NOT claimed as deterministically caught", () => {
  // mns-2 (ignores option semantics), mns-3 (55.8 relabel), mns-6 (false direct
  // comparison) require the benchmark's declared lists or a model judge — the
  // registry must not pretend to catch them. mns-3's 55.8 is a structurally
  // valid same-question sum, so cross_question_arithmetic must NOT fire on it.
  assert.ok(!has("55.8% of fans have a visibility problem.", "cross_question_arithmetic"));
});
