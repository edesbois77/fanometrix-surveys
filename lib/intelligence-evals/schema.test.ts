// Deterministic, CI-safe. No OpenAI, no DB. Validates the benchmark schema and
// the FedEx-001 instance.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateBenchmark, type Benchmark } from "./schema";
import { loadFedexBenchmark } from "./benchmarks/fedex-ucl-001/benchmark";

function minimalValid(): Benchmark {
  return {
    benchmark_id: "t", source_study: "s", source_file: "f.csv", source_hash: "sha256:x", version: "1.0.0",
    not_in_source: [],
    allowed_groupings: [], forbidden_groupings: [],
    must_find: [
      { id: "a", expected_priority: 1, concept: "c", evidence_requirements: [{ question: "q" }], acceptable_interpretations: [], required_caveats: [], forbidden_extensions: [] },
      { id: "b", expected_priority: 2, concept: "c", evidence_requirements: [{ question: "q" }], acceptable_interpretations: [], required_caveats: [], forbidden_extensions: [] },
    ],
    may_find: [], must_not_say: [],
    expected_hierarchy: ["a", "b"],
    principles: [], selectivity: { max_headline_findings: 7, note: "n" },
  };
}

test("a well-formed benchmark validates", () => {
  const v = validateBenchmark(minimalValid());
  assert.equal(v.ok, true, v.errors.join("; "));
});

test("duplicate must_find id is rejected", () => {
  const b = minimalValid();
  b.must_find[1].id = "a";
  b.expected_hierarchy = ["a", "a"];
  assert.equal(validateBenchmark(b).ok, false);
});

test("expected_hierarchy must match priority order", () => {
  const b = minimalValid();
  b.expected_hierarchy = ["b", "a"]; // wrong order
  const v = validateBenchmark(b);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /expected_hierarchy order/.test(e)));
});

test("a cross-question ALLOWED grouping is rejected (Principle 3)", () => {
  const b = minimalValid();
  b.allowed_groupings = [{ value: 70, components: [{ question: "q1", option: "x" }, { question: "q2", option: "y" }], question_span: 2 }];
  const v = validateBenchmark(b);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /cross-question sums can never be allowed/.test(e)));
});

test("question_span must equal distinct component questions", () => {
  const b = minimalValid();
  b.forbidden_groupings = [{ value: 50, components: [{ question: "q1", option: "x" }, { question: "q2", option: "y" }], question_span: 1 }];
  assert.equal(validateBenchmark(b).ok, false);
});

test("unknown scoreability tier is rejected", () => {
  const b = minimalValid();
  b.must_not_say = [{ id: "z", failure_type: "f", prohibited_concept: "p", reason: "r", rule_violated: "P1", scoreability: "sometimes" as never }];
  assert.equal(validateBenchmark(b).ok, false);
});

test("FedEx-001 gold standard loads and validates", () => {
  const b = loadFedexBenchmark();
  const v = validateBenchmark(b);
  assert.equal(v.ok, true, v.errors.join("; "));
  assert.equal(b.benchmark_id, "fedex-ucl-001");
  assert.equal(b.must_find.length, 5);
  assert.deepEqual(b.expected_hierarchy, ["mf-1", "mf-2", "mf-3", "mf-4", "mf-5"]);
  assert.equal(b.must_not_say.length, 9);
  assert.equal(b.principles.length, 10);
  assert.match(b.source_hash, /^sha256:[0-9a-f]{32}$/);
});
