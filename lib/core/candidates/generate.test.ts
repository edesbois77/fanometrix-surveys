import { test } from "node:test";
import assert from "node:assert/strict";
import { generateCandidates } from "./generate";
import type { DiscoveryInput } from "./types";

const q = (key: string, opts: [string, number][], base: number, waves?: { id: string; base: number; opts: [string, number][] }[]) => ({
  questionKey: key, questionText: key, base,
  options: opts.map(([id, count]) => ({ id, label: id, count })),
  waves: waves?.map((w) => ({ waveId: w.id, base: w.base, options: w.opts.map(([id, count]) => ({ id, label: id, count })) })),
});

test("a clear leader yields a leading_option candidate; a split yields distribution_shape", () => {
  const clear: DiscoveryInput = { questions: [q("q1", [["a", 60], ["b", 20], ["c", 20]], 100)] };
  const kinds = generateCandidates(clear).map((c) => c.kind);
  assert.ok(kinds.includes("leading_option"));
  const split: DiscoveryInput = { questions: [q("q2", [["a", 34], ["b", 33], ["c", 33]], 100)] };
  assert.ok(generateCandidates(split).map((c) => c.kind).includes("distribution_shape"));
});

test("generation is selective: no per-option commentary, one primary per question, no cross-question candidates", () => {
  const input: DiscoveryInput = { questions: [q("q1", [["a", 40], ["b", 30], ["c", 20], ["d", 10]], 100)] };
  const cs = generateCandidates(input);
  // At most a small number of candidates (primary + optional minority + grouping proposal).
  assert.ok(cs.length <= 3, `too many candidates: ${cs.length}`);
  assert.equal(cs.filter((c) => c.kind === "leading_option" || c.kind === "distribution_shape").length, 1);
  // No candidate spans more than one question (no cross-question arithmetic).
  assert.ok(cs.every((c) => c.sourceQuestionKeys.length === 1));
});

test("no inverse-duplicate comparisons are generated", () => {
  const cs = generateCandidates({ questions: [q("q1", [["a", 60], ["b", 40]], 100)] });
  // Only options ≥2 → no grouping proposal; a single leading candidate, not two directions.
  assert.equal(cs.filter((c) => c.kind === "leading_option").length, 1);
});

test("a wave difference is generated only for a notable move; a small move is ignored", () => {
  const input: DiscoveryInput = {
    questions: [q("q1", [["a", 50], ["b", 50]], 100, [
      { id: "s1", base: 50, opts: [["a", 30], ["b", 20]] }, // a=60%
      { id: "s2", base: 50, opts: [["a", 12], ["b", 38]] }, // a=24% → 36pp move
    ])],
  };
  assert.ok(generateCandidates(input).some((c) => c.kind === "wave_difference"));
  const small: DiscoveryInput = { questions: [q("q1", [["a", 50], ["b", 50]], 100, [
    { id: "s1", base: 50, opts: [["a", 26], ["b", 24]] }, { id: "s2", base: 50, opts: [["a", 24], ["b", 26]] },
  ])] };
  assert.ok(!generateCandidates(small).some((c) => c.kind === "wave_difference"));
});

test("a below-minimum base produces no candidates (not noise)", () => {
  assert.equal(generateCandidates({ questions: [q("q1", [["a", 10], ["b", 5]], 15)] }).length, 0);
});
