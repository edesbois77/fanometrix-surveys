// Stage 3 — FedEx Benchmark 001 hierarchy behaviour (deterministic, no live AI).
// The benchmark is the exam: no FedEx ids/percentages are hard-coded in the
// assessment engine — this test exercises the generic engine on the fixture.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fedexCandidates, FEDEX_CONTEXT } from "./fedex-fixture";
import { assessFindings } from "./assess";
import { loadFedexBenchmark } from "@/lib/intelligence-evals/benchmarks/fedex-ucl-001/benchmark";

const assessments = assessFindings(fedexCandidates(), FEDEX_CONTEXT);
const byId = new Map(assessments.map((a) => [a.findingId, a]));
const prio = (id: string) => byId.get(id)!.priority;
const ORDER = { primary: 0, secondary: 1, contextual: 2, suppressed: 3 };

test("the central relevance story (mf-1) is primary", () => {
  assert.equal(prio("mf-1"), "primary");
  // Its 64.6 grouping supports the story (eligible, not blocked).
  assert.notEqual(byId.get("mf-1")!.eligibility.level, "ineligible");
});

test("invalid 69.3 cross-question construction is ineligible and suppressed", () => {
  assert.equal(byId.get("inv-69")!.eligibility.level, "ineligible");
  assert.ok(byId.get("inv-69")!.eligibility.governanceIssueIds.includes("cross_question_arithmetic"));
  assert.equal(prio("inv-69"), "suppressed");
});

test("invalid 55.8 relabel is NOT promoted (held for model/human review)", () => {
  assert.notEqual(prio("inv-55"), "primary");
  assert.notEqual(prio("inv-55"), "secondary");
  assert.ok(byId.get("inv-55")!.modelAssisted.some((m) => /grouping/i.test(m)));
});

test("the 'dominant' overstatement never outranks the real relevance story", () => {
  assert.equal(prio("inv-dominant"), "suppressed");
  assert.ok(ORDER[prio("mf-1")] < ORDER[prio("inv-dominant")]);
});

test("a smaller-lead finding ranks below the central story; weak observations are not primary", () => {
  assert.ok(ORDER[prio("mf-1")] <= ORDER[prio("mf-3")]); // mf-3 (8.3pp) not above mf-1
  assert.notEqual(prio("mf-3"), "suppressed");            // but still eligible/valuable
  assert.notEqual(prio("may-3"), "primary");              // brand-visibility is not a headline
});

test("benchmark cross-check: 55.8 and 69.3 are benchmark-forbidden and the Core does not surface them as findings", () => {
  const b = loadFedexBenchmark();
  const forbidden = b.forbidden_groupings.map((g) => g.value);
  assert.ok(forbidden.includes(55.8) && forbidden.includes(69.3));
  for (const id of ["inv-55", "inv-69"]) {
    assert.ok(["contextual", "suppressed"].includes(prio(id)), `${id} must not be a surfaced finding`);
  }
});

test("all must-find concepts are eligible and none of them is suppressed for being invalid", () => {
  for (const id of ["mf-1", "mf-2", "mf-3", "mf-4", "mf-5"]) {
    assert.notEqual(byId.get(id)!.eligibility.level, "ineligible", `${id} should be eligible`);
  }
});
