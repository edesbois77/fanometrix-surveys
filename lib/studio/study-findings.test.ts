import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStudyFindings, FINDING_MIN_BASE } from "./study-findings";
import type { ComparableGroup } from "./dashboard-study";

// Helper: a two-survey comparable group from raw counts (aligned option order).
const group = (key: string, text: string, labels: string[], v1: number[], v2: number[]): ComparableGroup => {
  const mk = (id: string, name: string, counts: number[]) => { const base = counts.reduce((a, b) => a + b, 0); return { surveyId: id, surveyName: name, base, options: labels.map((label, i) => ({ label, count: counts[i], percentage: base > 0 ? (counts[i] / base) * 100 : null })) }; };
  return { canonicalKey: key, text, surveys: [mk("a", "Survey", v1), mk("b", "Survey v2", v2)] };
};

// Real audited FedEx distributions.
const FEDEX: ComparableGroup[] = [
  group("q1", "FedEx as a Champions League sponsor?", ["Strong natural fit", "Relevant but unclear", "Mostly brand visibility", "Never noticed them"], [62, 58, 23, 53], [30, 27, 6, 15]),
  group("q2", "What should sponsors offer fans?", ["Exclusive access", "Rewards and benefits", "Better fan experiences", "Investment in grassroots"], [41, 66, 41, 48], [18, 34, 19, 7]),
  group("q3", "How could FedEx help fans most?", ["Access to experiences", "Connecting football fans", "Exclusive football content", "Supporting local communities"], [61, 49, 47, 39], [29, 18, 11, 20]),
];

test("FedEx leading findings are pooled over COMPLETED answers (n=274), one per question, strongest first", () => {
  const f = buildStudyFindings({ comparableGroups: FEDEX });
  assert.equal(f.length, 3);
  assert.equal(f[0].emphasis, "primary");
  assert.equal(f[0].question, "What should sponsors offer fans?");
  assert.match(f[0].text, /Rewards and benefits was the most selected answer at 36%/);
  assert.equal(f[0].base, 274); // 196 + 78 completed answers — NOT the 1,242 partial counts
  for (const x of f) assert.equal(x.evidence.surveys.length, 2);
});

test("FedEx surveys tell a CONSISTENT story — no noise-level movement is surfaced as a change", () => {
  const f = buildStudyFindings({ comparableGroups: FEDEX });
  assert.ok(f.every((x) => x.kind === "consistent"), "every FedEx question has a consistent leader");
  assert.ok(f.every((x) => x.delta === undefined), "no change finding clears the combined margin of error at n=196/78");
});

test("a change IS surfaced only when it exceeds the combined margin of error (large bases, big move)", () => {
  // Leader A moves 55% → 80% with n=600 each → well beyond the combined MoE.
  const big = group("qX", "Big movement?", ["A", "B"], [330, 270], [480, 120]);
  const f = buildStudyFindings({ comparableGroups: [big] });
  const change = f.find((x) => x.kind === "change");
  assert.ok(change, "a large, well-based movement produces a change finding");
  assert.equal(change!.delta!.pp, 25); // 80 - 55
  assert.match(change!.text, /A went from 55% in Survey to 80% in Survey v2/);
});

test("change is self-consistent: pp equals the difference of the displayed rounded percentages", () => {
  const g = group("qY", "Self-consistent?", ["A", "B"], [200, 200], [300, 100]); // A: 50% → 75%
  const f = buildStudyFindings({ comparableGroups: [g] });
  const change = f.find((x) => x.kind === "change")!;
  const per = change.evidence.perSurvey!;
  assert.equal(change.delta!.pp, per[1].pct - per[0].pct);
});

test("minimum base gates findings — a group below FINDING_MIN_BASE yields nothing (fail closed)", () => {
  const tiny = group("qT", "Tiny?", ["A", "B"], [8, 6], [4, 2]); // pooled base 20 < 30
  assert.ok(FINDING_MIN_BASE >= 30);
  assert.deepEqual(buildStudyFindings({ comparableGroups: [tiny] }), []);
});

test("never invents a cross-survey comparison — a single-member group is ignored", () => {
  const oneSurvey: ComparableGroup = { canonicalKey: "q", text: "Solo?", surveys: [{ surveyId: "a", surveyName: "Survey", base: 100, options: [{ label: "A", count: 70, percentage: 70 }, { label: "B", count: 30, percentage: 30 }] }] };
  assert.deepEqual(buildStudyFindings({ comparableGroups: [oneSurvey] }), []);
});

test("single-survey fallback surfaces a leading response but never a cross-survey claim", () => {
  const f = buildStudyFindings({ comparableGroups: [], singleSurvey: { surveyName: "Only survey", questions: [{ text: "Pick one", base: 120, options: [{ label: "A", count: 70 }, { label: "B", count: 50 }] }] } });
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, "leading");
  assert.match(f[0].text, /A was the most selected answer at 58%/);
  assert.deepEqual(f[0].evidence.surveys, ["Only survey"]);
});

test("no evidence → no findings (never fabricates a card to fill space)", () => {
  assert.deepEqual(buildStudyFindings({ comparableGroups: [] }), []);
  assert.deepEqual(buildStudyFindings({ comparableGroups: [], singleSurvey: null }), []);
});

test("findings carry explainable evidence (surveys, option, pct, runner-up, per-survey)", () => {
  const f = buildStudyFindings({ comparableGroups: FEDEX });
  const primary = f[0];
  assert.equal(primary.evidence.option, "Rewards and benefits");
  assert.equal(primary.evidence.pct, 36);
  assert.ok(primary.evidence.runnerUp);
  assert.equal(primary.evidence.perSurvey!.length, 2);
});
