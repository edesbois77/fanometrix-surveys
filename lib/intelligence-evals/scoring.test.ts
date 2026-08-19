// Deterministic, CI-safe. No OpenAI, no DB. Exercises the pure scorer against
// the FedEx-001 source model + synthetic "good" and "bad" analyses.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyNumber, explainAsSum, numbersIn, scoreBenchmark,
  scoreArithmeticAndGrounding, scoreLexicalMustNotSay, listCrossQuestionFindings,
} from "./scoring";
import { loadFedexBenchmark, fedexSourceModel } from "./benchmarks/fedex-ucl-001/benchmark";
import type { AnalysisUnderTest } from "./capture-contract";

const benchmark = loadFedexBenchmark();
const source = fedexSourceModel();

// ── number classification (the crown-jewel deterministic check) ──────────────
test("governed option percentages classify as grounded", () => {
  for (const n of [33.6, 31.0, 10.6, 24.8, 36.5, 32.8, 2.6, 14.6, 8.3]) {
    assert.equal(classifyNumber(n, source, benchmark).kind, "grounded", `expected ${n} grounded`);
  }
});

test("the relevance grouping 64.6 is an ALLOWED grouping (33.6 + 31.0)", () => {
  const c = classifyNumber(64.6, source, benchmark);
  assert.equal(c.kind, "allowed_grouping");
  assert.equal(c.grouping?.concept, "perceives at least some relevance between FedEx and the UEFA Champions League");
});

test("55.8 is a FORBIDDEN grouping (Relevant-but-unclear + Never-noticed)", () => {
  assert.equal(classifyNumber(55.8, source, benchmark).kind, "forbidden_grouping");
});

test("69.3 is a FORBIDDEN grouping (cross-question Q2 + Q3)", () => {
  assert.equal(classifyNumber(69.3, source, benchmark).kind, "forbidden_grouping");
});

test("an undeclared cross-question sum is caught generically", () => {
  // 33.6 (Q1 strong_fit) + 36.5 (Q2 rewards) = 70.1 — not declared anywhere.
  const c = classifyNumber(70.1, source, benchmark);
  assert.equal(c.kind, "cross_question_sum");
  assert.equal(c.explanation?.questionSpan, 2);
});

test("a number the source cannot support is ungrounded", () => {
  assert.equal(classifyNumber(88.8, source, benchmark).kind, "ungrounded");
});

test("explainAsSum finds the same-question composition of 55.8", () => {
  const e = explainAsSum(55.8, source.options);
  assert.ok(e);
  assert.equal(e!.questionSpan, 1);
  assert.deepEqual(e!.terms.map((t) => t.option).sort(), ["never_noticed", "relevant_unclear"]);
});

test("numbersIn extracts %, pp and points figures from prose", () => {
  assert.deepEqual(numbersIn("64.6% see relevance; rewards lead by 14.6pp and 5 points"), [64.6, 14.6, 5]);
});

// ── a GOOD analysis (expresses mf-1..mf-5, correct numbers, correct order) ────
const good: AnalysisUnderTest = {
  benchmarkId: "fedex-ucl-001",
  producedBy: "test-good",
  findings: [
    { id: "g1", rank: 1, claimsMustFindId: "mf-1", citedQuestions: ["q_fit"], statedNumbers: [64.6, 33.6, 31.0, 24.8],
      text: "About two-thirds (64.6%) perceive at least some relevance; only 33.6% call it a strong natural fit, 31.0% find it relevant but unclear, and 24.8% have never noticed FedEx." },
    { id: "g2", rank: 2, claimsMustFindId: "mf-2", citedQuestions: ["q_offer"], statedNumbers: [36.5, 14.6],
      text: "Rewards and benefits is the clearest general expectation at 36.5%, materially ahead (14.6pp) of the options clustered near a fifth." },
    { id: "g3", rank: 3, claimsMustFindId: "mf-3", citedQuestions: ["q_help"], statedNumbers: [32.8, 8.3],
      text: "Asked how FedEx could help, access to experiences leads the question at 32.8%, 8.3pp ahead of the next option." },
    { id: "g4", rank: 4, claimsMustFindId: "mf-4", citedQuestions: ["q_offer", "q_help"], statedNumbers: [36.5, 32.8],
      text: "Across both activation questions fans favour tangible value or access: rewards lead Q2 (36.5%) and access to experiences leads Q3 (32.8%)." },
    { id: "g5", rank: 5, claimsMustFindId: "mf-5", citedQuestions: ["q_fit"], statedNumbers: [33.6, 31.0, 10.6, 24.8],
      text: "Respondents occupy different states of recognition: strong fit 33.6%, relevant but unclear 31.0%, mostly visibility 10.6%, never noticed 24.8%." },
  ],
};

test("GOOD analysis: no arithmetic violations, fully grounded", () => {
  const s = scoreBenchmark(good, benchmark, source);
  assert.equal(s.gate.arithmeticViolations, 0);
  assert.equal(s.gate.ungroundedNumbers, 0);
  assert.equal(s.gate.overBudget, false);
  const arith = s.dimensions.find((d) => d.dimension === "arithmetic_validity")!;
  const ground = s.dimensions.find((d) => d.dimension === "evidence_grounding_numeric")!;
  assert.equal(arith.score, 1);
  assert.equal(ground.score, 1);
});

test("GOOD analysis: full recall and correct ranking from self-tags", () => {
  const s = scoreBenchmark(good, benchmark, source);
  const recall = s.dimensions.find((d) => d.dimension === "must_find_recall")!;
  const ranking = s.dimensions.find((d) => d.dimension === "ranking_quality")!;
  assert.equal(recall.status, "scored");
  assert.equal(recall.score, 1);
  assert.equal(ranking.status, "scored");
  assert.equal(ranking.score, 1);
});

test("GOOD analysis: mf-4 is a legitimate cross-question synthesis (no summed number)", () => {
  const x = listCrossQuestionFindings(good, benchmark, source);
  assert.deepEqual(x.withProhibitedSum, []);
  assert.ok(x.candidateSynthesis.includes("g4"));
});

test("GOOD analysis: no lexical MUST-NOT-SAY flags", () => {
  const flags = (scoreLexicalMustNotSay(good, benchmark, source).detail.flags as unknown[]);
  assert.equal(flags.length, 0);
});

test("scorer is honest: semantic/human dimensions are marked unscoreable, not faked", () => {
  const s = scoreBenchmark(good, benchmark, source);
  const semantic = s.dimensions.find((d) => d.dimension === "must_find_recall_semantic")!;
  const human = s.dimensions.find((d) => d.dimension === "tells_the_real_story")!;
  assert.equal(semantic.status, "unscoreable");
  assert.equal(semantic.tier, "model-assisted");
  assert.equal(human.status, "unscoreable");
  assert.equal(human.tier, "human");
  assert.equal(semantic.score, undefined);
});

// ── a BAD analysis (the enumerated MUST-NOT-SAY failures) ────────────────────
const bad: AnalysisUnderTest = {
  benchmarkId: "fedex-ucl-001",
  producedBy: "test-bad",
  findings: [
    { id: "b1", rank: 1, citedQuestions: ["q_fit"], statedNumbers: [], text: "Strong natural fit is the dominant perception of FedEx." },
    { id: "b2", rank: 2, citedQuestions: ["q_fit"], statedNumbers: [55.8], text: "55.8% of fans have a visibility problem." },
    { id: "b3", rank: 3, citedQuestions: ["q_offer", "q_help"], statedNumbers: [69.3], text: "Rewards and experiences are preferred by 69.3% of fans." },
    { id: "b4", rank: 4, citedQuestions: ["q_help"], statedNumbers: [], text: "FedEx should provide experiences because this will improve sponsorship perception." },
    { id: "b5", rank: 5, citedQuestions: ["q_offer"], statedNumbers: [], text: "Interest in grassroots support has collapsed since Survey 1." },
    { id: "b6", rank: 6, citedQuestions: ["q_fit"], statedNumbers: [], text: "In Germany, most fans have never noticed FedEx." },
  ],
};

test("BAD analysis: both prohibited sums are caught as arithmetic violations", () => {
  const s = scoreBenchmark(bad, benchmark, source);
  assert.equal(s.gate.arithmeticViolations, 2); // 55.8 and 69.3
  const arith = s.dimensions.find((d) => d.dimension === "arithmetic_validity")!;
  const violations = arith.detail.violations as { value: number }[];
  assert.deepEqual(violations.map((v) => v.value).sort(), [55.8, 69.3]);
});

test("BAD analysis: cross-question finding with a summed number is flagged", () => {
  const x = listCrossQuestionFindings(bad, benchmark, source);
  assert.ok(x.withProhibitedSum.includes("b3"));
});

test("BAD analysis: lexical flags catch overstated lead, causation and trend", () => {
  const flags = scoreLexicalMustNotSay(bad, benchmark, source).detail.flags as { failure_type: string }[];
  const types = new Set(flags.map((f) => f.failure_type));
  assert.ok(types.has("overstated_lead"), "dominant on a 2.6pp lead");
  assert.ok(types.has("unsupported_causation"), "will improve ... because");
  assert.ok(types.has("unsupported_trend"), "collapsed since Survey 1");
});

test("BAD analysis: country claim flagged NOT ASSESSABLE (not auto-failed)", () => {
  const s = scoreBenchmark(bad, benchmark, source);
  const nis = s.dimensions.find((d) => d.dimension === "not_in_source_claims")!;
  assert.equal(nis.status, "flags-only");
  const hits = nis.detail.hits as { findingId: string }[];
  assert.ok(hits.some((h) => h.findingId === "b6"));
});

test("arithmetic pass computes grounded fraction correctly on a mixed analysis", () => {
  const mixed: AnalysisUnderTest = {
    benchmarkId: "fedex-ucl-001", producedBy: "test-mixed",
    findings: [{ id: "m1", rank: 1, citedQuestions: ["q_fit"], statedNumbers: [33.6, 64.6, 55.8, 88.8], text: "mixed" }],
  };
  const { arithmetic, grounding } = scoreArithmeticAndGrounding(mixed, benchmark, source);
  // 33.6 grounded, 64.6 allowed (grounded), 55.8 forbidden (violation), 88.8 ungrounded.
  assert.equal((arithmetic.detail.violations as unknown[]).length, 1);
  assert.equal((grounding.detail.ungrounded as unknown[]).length, 1);
  assert.equal(grounding.score, 0.5); // 2 of 4 grounded
});
