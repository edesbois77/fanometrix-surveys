import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSurveyFindings, findingsContext, assertNoCorrelationClaim, CORRELATION_BANNED,
  type SurveyQuestionEvidence, type SurveySegmentEvidence,
} from "./survey-findings-engine";
import type { OptionResult, QuestionResult } from "./survey-results";
import type { SegmentQuestion, SegmentGroupDist } from "./study-segments";

// ── Builders ──────────────────────────────────────────────────────────────────
function opts(pairs: [string, number][]): OptionResult[] {
  const base = pairs.reduce((a, [, c]) => a + c, 0);
  return pairs.map(([label, count], i) => ({ optionId: String(i + 1), label, count, percentage: base > 0 ? count / base : null }));
}
function q(index: number, text: string, pairs: [string, number][], shown: number | null = null): SurveyQuestionEvidence {
  const options = opts(pairs);
  return { index, questionId: `q${index}`, text, base: options.reduce((a, o) => a + o.count, 0), shown, options };
}
function group(key: string, label: string, pairs: [string, number][]): SegmentGroupDist {
  const options = opts(pairs);
  return { key, label, base: options.reduce((a, o) => a + o.count, 0), options };
}
function segQ(question: string, groups: SegmentGroupDist[]): SegmentQuestion {
  // pooled overall
  const n = Math.max(...groups.map((g) => g.options.length));
  const pooled = Array.from({ length: n }, (_, i) => groups.reduce((a, g) => a + (g.options[i]?.count ?? 0), 0));
  const base = pooled.reduce((a, b) => a + b, 0);
  const overall: OptionResult[] = groups[0].options.map((o, i) => ({ optionId: o.optionId, label: o.label, count: pooled[i], percentage: base > 0 ? pooled[i] / base : null }));
  return { canonicalQuestionKey: question, question, dimension: "market", overall, overallBase: base, groups };
}

// ── Base gating ──────────────────────────────────────────────────────────────
test("insufficient base → no finding", () => {
  const f = buildSurveyFindings({ surveyName: "S", mode: "studio_native", questions: [q(0, "Q1", [["A", 15], ["B", 5]])] });
  assert.equal(f.length, 0);
});

// ── Dominant ─────────────────────────────────────────────────────────────────
test("dominant attitude: clear majority surfaces a dominant finding", () => {
  const f = buildSurveyFindings({ surveyName: "S", mode: "studio_native", questions: [q(0, "Rate the sponsor", [["Strong fit", 60], ["Unclear", 22], ["Never noticed", 18]])] });
  const dom = f.find((x) => x.type === "dominant");
  assert.ok(dom, "expected a dominant finding");
  assert.match(dom!.title, /Strong fit/);
  assert.match(dom!.title, /60%/);
  assert.equal(dom!.emphasis, "primary");
});

// ── Divided ──────────────────────────────────────────────────────────────────
test("divided/no-consensus: close top two, none dominant", () => {
  const f = buildSurveyFindings({ surveyName: "S", mode: "studio_native", questions: [q(0, "What matters?", [["A", 35], ["B", 33], ["C", 32]])] });
  const div = f.find((x) => x.type === "divided");
  assert.ok(div, "expected a divided finding");
  assert.match(div!.title, /split|no single/i);
});

// ── Notable minority ─────────────────────────────────────────────────────────
test("notable minority appears alongside a clear leader", () => {
  const f = buildSurveyFindings({ surveyName: "S", mode: "studio_native", questions: [q(0, "View", [["Positive", 55], ["Negative", 30], ["Neutral", 15]])] });
  const min = f.find((x) => x.type === "minority");
  assert.ok(min, "expected a notable-minority finding");
  assert.match(min!.title, /30%/);
  assert.match(min!.title, /Negative/);
});

// ── Aggregate pattern — descriptive, never correlational ─────────────────────
test("aggregate multi-question pattern is descriptive and never implies respondent correlation", () => {
  const f = buildSurveyFindings({
    surveyName: "S", mode: "studio_native",
    questions: [
      q(0, "Sponsor recognition", [["Strong", 62], ["Weak", 20], ["None", 18]]),
      q(1, "Should sponsors help fans?", [["Yes", 70], ["No", 15], ["Unsure", 15]]),
    ],
  });
  const pat = f.find((x) => x.type === "pattern");
  assert.ok(pat, "expected an aggregate pattern finding");
  // MUST NOT imply the same respondents held both views.
  for (const re of CORRELATION_BANNED) {
    assert.doesNotMatch(pat!.title, re);
    assert.doesNotMatch(pat!.detail ?? "", re);
  }
  assert.match(pat!.title, /decisive/i);
});

test("the correlation guardrail actually rejects a respondent-level claim", () => {
  assert.throws(() => assertNoCorrelationClaim("Respondents who answered Yes were more likely to answer Positive"));
  assert.throws(() => assertNoCorrelationClaim("The same respondents were positive on both"));
  assert.doesNotThrow(() => assertNoCorrelationClaim("A clear leader emerged on both questions"));
});

// ── Segment base gating ──────────────────────────────────────────────────────
test("segment difference below per-group base is suppressed (no market finding)", () => {
  const seg: SurveySegmentEvidence = {
    dimension: "market",
    questions: [segQ("Q", [group("uk", "United Kingdom", [["A", 20], ["B", 5]]), group("de", "Germany", [["A", 8], ["B", 12]])])],
  };
  const f = buildSurveyFindings({ surveyName: "S", mode: "historical_completed_only", questions: [q(0, "Q", [["A", 28], ["B", 17]])], segments: [seg] });
  assert.equal(f.filter((x) => x.type === "market").length, 0, "groups < 30 must not yield a market difference");
});

test("segment difference with adequate bases + real spread surfaces a market finding", () => {
  const seg: SurveySegmentEvidence = {
    dimension: "market",
    questions: [segQ("Q", [group("uk", "United Kingdom", [["A", 35], ["B", 15]]), group("de", "Germany", [["A", 25], ["B", 25]])])],
  };
  const f = buildSurveyFindings({ surveyName: "S", mode: "historical_completed_only", questions: [q(0, "Q", [["A", 60], ["B", 40]])], segments: [seg] });
  const mk = f.find((x) => x.type === "market");
  assert.ok(mk, "expected a market difference finding");
  assert.match(mk!.tag, /Market/);
  for (const re of CORRELATION_BANNED) assert.doesNotMatch(`${mk!.title} ${mk!.detail}`, re);
});

test("segment leader reversal is described as a difference by market", () => {
  const seg: SurveySegmentEvidence = {
    dimension: "market",
    questions: [segQ("Recognition", [group("uk", "United Kingdom", [["Strong", 35], ["Weak", 15]]), group("de", "Germany", [["Strong", 18], ["Weak", 34]])])],
  };
  const f = buildSurveyFindings({ surveyName: "S", mode: "historical_completed_only", questions: [q(0, "Recognition", [["Strong", 53], ["Weak", 49]])], segments: [seg] });
  const mk = f.find((x) => x.type === "market");
  assert.ok(mk);
  assert.match(mk!.title, /differ by market/i);
});

// ── Completion (studio-native only) ──────────────────────────────────────────
test("completion/drop-off surfaces where shown is available (studio-native)", () => {
  const f = buildSurveyFindings({
    surveyName: "S", mode: "studio_native",
    questions: [
      { ...q(0, "Q1", [["A", 90], ["B", 10]]), shown: 100 },
      { ...q(1, "Q2 late", [["A", 30], ["B", 20]]), shown: 100 },
    ],
  });
  const comp = f.find((x) => x.type === "completion");
  assert.ok(comp, "expected a completion finding");
  assert.match(comp!.title, /Q2 late/);
});

test("historical (shown unavailable) yields NO completion finding", () => {
  const f = buildSurveyFindings({
    surveyName: "S", mode: "historical_completed_only",
    questions: [q(0, "Q1", [["A", 90], ["B", 10]], null), q(1, "Q2", [["A", 30], ["B", 20]], null)],
  });
  assert.equal(f.filter((x) => x.type === "completion").length, 0);
});

// ── Historical ≤3Q honesty + no fabrication ──────────────────────────────────
test("historical ≤3-question survey: engine uses only the questions given, no invention", () => {
  const f = buildSurveyFindings({
    surveyName: "S", mode: "historical_completed_only",
    questions: [q(0, "Q1", [["A", 60], ["B", 40]]), q(1, "Q2", [["A", 35], ["B", 33], ["C", 32]])],
  });
  // Every finding references one of the two real questions — never a Q4/Q5.
  for (const x of f) for (const sq of x.supportingQuestions) assert.ok(sq === "Q1" || sq === "Q2");
});

// ── Selection: no mechanical one-per-question, dominant capped ────────────────
test("per-question coverage: every substantial question gets a primary finding + an aggregate pattern, bounded", () => {
  const qs = [0, 1, 2, 3].map((i) => q(i, `Q${i}`, [["A", 70], ["B", 30]])); // 4 dominant questions
  const f = buildSurveyFindings({ surveyName: "S", mode: "studio_native", questions: qs });
  // Coverage: each of the 4 questions is represented by a primary (dominant/leading/divided).
  const primaryTypes = new Set(["dominant", "leading", "divided"]);
  const coveredQ = new Set(f.filter((x) => primaryTypes.has(x.type)).flatMap((x) => x.supportingQuestions));
  for (const qq of qs) assert.ok(coveredQ.has(qq.text), `question ${qq.text} is represented`);
  assert.ok(f.some((x) => x.type === "pattern"), "an aggregate pattern should summarise the decisive questions");
  assert.ok(f.length <= 8, "still bounded (never a wall)");
});
test("middling question (clear front-runner, not a majority or dead heat) yields a Leading finding — no coverage hole", () => {
  // 44% vs 35% (gap 9): NOT dominant (<50, gap<20), NOT divided (top ≥40) → previously produced NOTHING.
  const f = buildSurveyFindings({ surveyName: "S", mode: "studio_native", questions: [q(0, "Middling Q", [["A", 44], ["B", 35], ["C", 21]])] });
  const lead = f.find((x) => x.type === "leading");
  assert.ok(lead, "a leading finding fills the middling-question gap");
  assert.match(lead!.title, /most-selected/);
  assert.match(lead!.title, /44%/);
  assert.equal(f.length >= 1, true);
});
test("FedEx-v2-like 3-question survey produces a substantial baseline (not two cards)", () => {
  // Three middling/mixed questions like the real thin case — each must be represented.
  const f = buildSurveyFindings({ surveyName: "FedEx v2", mode: "historical_completed_only", questions: [
    q(0, "Recognition", [["Strong fit", 34], ["Relevant but unclear", 30], ["Mostly visibility", 8], ["Never noticed", 6]]), // 44/38 → leading
    q(1, "What sponsors should offer", [["Rewards", 28], ["Experiences", 24], ["Access", 14], ["Grassroots", 12]]),         // 36/31 → leading
    q(2, "How FedEx could help", [["Experiences", 30], ["Connecting fans", 22], ["Content", 14], ["Community", 12]]),        // 39/28 → leading
  ] });
  assert.ok(f.length >= 3, `expected ≥3 findings for a 3-question survey, got ${f.length}`);
  for (const t of ["Recognition", "What sponsors should offer", "How FedEx could help"]) {
    assert.ok(f.some((x) => x.supportingQuestions.includes(t)), `${t} represented`);
  }
});

// ── Context (Emerging / Final / none) ────────────────────────────────────────
test("findingsContext: emerging while live, final when closed, none below base", () => {
  assert.equal(findingsContext({ hasLiveCampaign: true, totalAnswered: 200 }), "emerging");
  assert.equal(findingsContext({ hasLiveCampaign: false, totalAnswered: 200 }), "final");
  assert.equal(findingsContext({ hasLiveCampaign: false, totalAnswered: 10 }), "none");
});

// Keep an unused import honest (QuestionResult type parity with resolver output).
export type _ = QuestionResult;
