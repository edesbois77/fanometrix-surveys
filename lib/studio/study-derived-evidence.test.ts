import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDerivedEvidence } from "./study-derived-evidence";
import { evidenceRef } from "./study-analysis";
import type { StudyResultGroup, StudyResultSource } from "./study-results";
import type { OptionResult } from "./survey-results";

const opt = (id: string, label: string, count: number, base: number): OptionResult => ({ optionId: id, label, count, percentage: base > 0 ? count / base : null });
function src(id: string, name: string, key: string, counts: Record<string, number>, labels: Record<string, string>): StudyResultSource {
  const base = Object.values(counts).reduce((a, b) => a + b, 0);
  return { surveyId: id, surveyName: name, questionIndex: 0, questionId: key, canonicalQuestionKey: key, label: "Q", resultMode: "historical", completedResponses: base, base, shown: null, displayLanguage: "en", options: Object.keys(labels).map((oid) => opt(oid, labels[oid], counts[oid] ?? 0, base)) };
}
// FedEx-Q1-shaped combined group across 2 surveys.
const LABELS = { "1": "Strong natural fit", "2": "Relevant but unclear", "3": "Mostly brand visibility", "4": "Never noticed them" };
const s1 = src("s1", "Survey 1", "q_fit", { "1": 62, "2": 58, "3": 23, "4": 53 }, LABELS); // n=196
const s2 = src("s2", "Survey v2", "q_fit", { "1": 30, "2": 27, "3": 6, "4": 15 }, LABELS);  // n=78
const combined = { base: 274, sourceCount: 2, options: [opt("1", LABELS["1"], 92, 274), opt("2", LABELS["2"], 85, 274), opt("3", LABELS["3"], 29, 274), opt("4", LABELS["4"], 68, 274)] };
const group: StudyResultGroup = { canonicalQuestionKey: "q_fit", label: "FedEx as a sponsor?", comparability: "combined", combined, sources: [s1, s2] };
const derived = buildDerivedEvidence("STU", [group]);
const byKind = (k: string) => derived.filter((d) => d.kind === k);

test("3,4. leader derivation: leader + lead gap in pp are correct", () => {
  const l = byKind("leader")[0];
  assert.equal(l.detail.leader, "Strong natural fit");
  assert.equal(l.detail.leaderPct, 33.6);
  assert.equal(l.value, 2.6); // 33.6 − 31.0
  assert.deepEqual(l.inputRefs, [evidenceRef("STU", "q_fit", "1", "combined"), evidenceRef("STU", "q_fit", "2", "combined")]);
});

test("12,13,14,16. top-2 grouped share is the combined selection %, labelled structurally (no sentiment)", () => {
  const g = byKind("grouped_share")[0];
  assert.equal(g.value, 64.6);         // (92+85)/274
  assert.equal(g.detail.count, 177);
  assert.equal(g.detail.base, 274);
  assert.match(g.label, /two most-selected options together/);
  assert.doesNotMatch(g.label, /positive|favourable|approve/i); // never overstates sentiment
  assert.match(String(g.detail.note), /not a sentiment measure/);
});

test("1,2,5. spreads are computed with pp magnitude + source refs, no significance label", () => {
  const spreads = byKind("spread");
  const never = spreads.find((s) => (s.detail.option as string) === "Never noticed them")!;
  assert.equal(never.value, 7.8); // 27.0 vs 19.2
  assert.deepEqual(never.inputRefs, [evidenceRef("STU", "q_fit", "4", "survey", "s1"), evidenceRef("STU", "q_fit", "4", "survey", "s2")]);
  assert.doesNotMatch(never.label, /significant|meaningful|materially/i);
  // Only spreads ≥ 5pp surface: strong-fit 6.9, never 7.8, relevant 5.0; visibility 4.0 excluded.
  assert.equal(spreads.length, 3);
  assert.ok(!spreads.some((s) => (s.detail.option as string) === "Mostly brand visibility"));
});

test("consistency: same leading option across both surveys is detected", () => {
  const c = byKind("consistency")[0];
  assert.equal(c.value, 1);
  assert.equal(c.detail.sameLeader, true);
  assert.equal(c.detail.leader, "Strong natural fit");
});

test("6,7. derivation is deterministic — same input → identical refs + values", () => {
  const again = buildDerivedEvidence("STU", [group]);
  assert.deepEqual(again.map((d) => d.ref), derived.map((d) => d.ref));
  assert.deepEqual(again.map((d) => d.value), derived.map((d) => d.value));
});

test("8. a non-comparable (separate) group produces no cross-survey derivation", () => {
  const sep: StudyResultGroup = { canonicalQuestionKey: "q_sep", label: "Sep", comparability: "separate", combined: null, sources: [s1] };
  const d = buildDerivedEvidence("STU", [sep]);
  assert.equal(d.filter((x) => x.kind === "spread" || x.kind === "consistency" || x.kind === "leader").length, 0);
});
