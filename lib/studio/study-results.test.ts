import { test } from "node:test";
import assert from "node:assert/strict";
import { groupStudyResults, combineSources, type SurveyResultsForStudy, type StudyResultSource } from "./study-results";
import type { QuestionResult, OptionResult } from "./survey-results";

// ── Fixtures ─────────────────────────────────────────────────────────────────
const opt = (id: string, label: string, count: number, base: number): OptionResult =>
  ({ optionId: id, label, count, percentage: base > 0 ? count / base : null });

// A question result with a 4-option scale (ids "1".."4"), base = Σ counts.
function q(idx: number, id: string, text: string, counts: Record<string, number>, optIds = ["1", "2", "3", "4"]): QuestionResult {
  const base = Object.values(counts).reduce((a, b) => a + b, 0);
  const options = optIds.map((oid) => opt(oid, `Opt ${oid}`, counts[oid] ?? 0, base));
  return { questionIndex: idx, questionId: id, text, shown: null, answered: base, completionRate: null, base, options };
}

function survey(id: string, name: string, questions: QuestionResult[], keys: string[], mode: "historical" | "studio_native" = "historical", completed?: number): SurveyResultsForStudy {
  return { surveyId: id, surveyName: name, resultMode: mode, completedResponses: completed ?? questions[0]?.base ?? 0, displayLanguage: "en", canonicalKeys: keys, questions };
}

// FedEx-shaped fixture: two surveys, identical cloned question ids.
const A = survey("A", "Survey 1", [q(0, "qk1", "Q1", { "1": 62, "2": 58, "3": 23, "4": 53 })], ["qk1"], "historical", 196);
const B = survey("B", "Survey v2", [q(0, "qk1", "Q1", { "1": 30, "2": 27, "3": 6, "4": 15 })], ["qk1"], "historical", 78);

// ── GROUPING ─────────────────────────────────────────────────────────────────
test("1. single-Survey study: every group is 'separate'", () => {
  const groups = groupStudyResults([A]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].comparability, "separate");
  assert.equal(groups[0].combined, null);
});

test("2,3,7. multi-Survey study with matching canonical key + compatible options → one combined group", () => {
  const groups = groupStudyResults([A, B]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].comparability, "combined");
  assert.equal(groups[0].sources.length, 2);
});

test("4. different canonical keys do NOT group", () => {
  const B2 = survey("B", "Survey v2", [q(0, "qkX", "Q1", { "1": 30, "2": 27, "3": 6, "4": 15 })], ["qkX"]);
  const groups = groupStudyResults([A, B2]);
  assert.equal(groups.length, 2);
  assert.ok(groups.every((g) => g.comparability === "separate"));
});

test("5. identical wording but different canonical keys do NOT group", () => {
  const same = { "1": 10, "2": 10, "3": 10, "4": 10 };
  const s1 = survey("A", "S1", [q(0, "keyA", "Same wording?", same)], ["keyA"]);
  const s2 = survey("B", "S2", [q(0, "keyB", "Same wording?", same)], ["keyB"]);
  const groups = groupStudyResults([s1, s2]);
  assert.equal(groups.length, 2, "identical text must not fuse different identities");
});

test("6. matching key but INCOMPATIBLE option ids → side_by_side, never combined", () => {
  const s1 = survey("A", "S1", [q(0, "qk1", "Q", { "1": 5, "2": 5 }, ["1", "2"])], ["qk1"]);
  const s2 = survey("B", "S2", [q(0, "qk1", "Q", { "1": 5, "2": 5, "3": 5 }, ["1", "2", "3"])], ["qk1"]);
  const groups = groupStudyResults([s1, s2]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].comparability, "side_by_side");
  assert.equal(groups[0].combined, null);
});

// ── MATHS ────────────────────────────────────────────────────────────────────
test("8,9,10. combined count = Σ counts, base = Σ bases, percentage recomputed from pooled base", () => {
  const g = groupStudyResults([A, B])[0];
  assert.ok(g.combined);
  assert.equal(g.combined!.base, 274); // 196 + 78
  const o1 = g.combined!.options.find((o) => o.optionId === "1")!;
  assert.equal(o1.count, 92); // 62 + 30
  assert.equal(o1.percentage, 92 / 274);
});

test("11. percentages are NEVER averaged (pooled, not mean of source rates)", () => {
  // A: 62/196 = 31.6%, B: 30/78 = 38.5%. Mean = 35.05%. Pooled = 92/274 = 33.6%.
  const g = groupStudyResults([A, B])[0];
  const o1 = g.combined!.options.find((o) => o.optionId === "1")!;
  const meanOfRates = (62 / 196 + 30 / 78) / 2;
  assert.notEqual(Math.round(o1.percentage! * 1000), Math.round(meanOfRates * 1000));
  assert.equal(Math.round(o1.percentage! * 1000), Math.round((92 / 274) * 1000));
});

test("12,13. partial per-question bases are respected; study total is NOT used as base", () => {
  // Survey A Q answered 190; Survey B Q answered 75; combined base must be 265, not 274.
  const a = survey("A", "S1", [q(0, "qk", "Q", { "1": 100, "2": 90 }, ["1", "2"])], ["qk"], "historical", 274);
  const b = survey("B", "S2", [q(0, "qk", "Q", { "1": 40, "2": 35 }, ["1", "2"])], ["qk"], "historical", 274);
  const g = groupStudyResults([a, b])[0];
  assert.equal(g.combined!.base, 265); // 190 + 75, not the operational 274
});

test("14. zero-base is safe (percentages null, no divide-by-zero)", () => {
  const a = survey("A", "S1", [q(0, "qk", "Q", { "1": 0, "2": 0 }, ["1", "2"])], ["qk"]);
  const b = survey("B", "S2", [q(0, "qk", "Q", { "1": 0, "2": 0 }, ["1", "2"])], ["qk"]);
  const g = groupStudyResults([a, b])[0];
  assert.equal(g.combined!.base, 0);
  assert.ok(g.combined!.options.every((o) => o.percentage === null));
});

test("15. an option absent from one source is treated as zero there, not dropped", () => {
  const sources: StudyResultSource[] = [
    { surveyId: "A", surveyName: "S1", questionIndex: 0, questionId: "q", canonicalQuestionKey: "qk", label: "Q", resultMode: "historical", completedResponses: 10, base: 10, shown: null, displayLanguage: "en", options: [opt("1", "One", 6, 10), opt("2", "Two", 4, 10)] },
    { surveyId: "B", surveyName: "S2", questionIndex: 0, questionId: "q", canonicalQuestionKey: "qk", label: "Q", resultMode: "historical", completedResponses: 5, base: 5, shown: null, displayLanguage: "en", options: [opt("1", "One", 5, 5)] },
  ];
  const c = combineSources(sources);
  assert.equal(c.options.find((o) => o.optionId === "1")!.count, 11);
  assert.equal(c.options.find((o) => o.optionId === "2")!.count, 4); // present, not dropped
});

// ── PROVENANCE ───────────────────────────────────────────────────────────────
test("16-21. combined group retains every source's full provenance", () => {
  const g = groupStudyResults([A, B])[0];
  assert.equal(g.sources.length, 2);
  const s = g.sources[0];
  assert.equal(s.surveyId, "A");
  assert.equal(s.questionId, "qk1");
  assert.equal(s.questionIndex, 0);
  assert.equal(s.canonicalQuestionKey, "qk1");
  assert.equal(s.base, 196);
  assert.equal(s.resultMode, "historical");
  assert.equal(s.options.find((o) => o.optionId === "1")!.count, 62);
});

// ── HISTORICAL ───────────────────────────────────────────────────────────────
test("22,23. historical answers combine; shown stays null (never fabricated)", () => {
  const g = groupStudyResults([A, B])[0];
  assert.ok(g.combined);
  assert.ok(g.sources.every((s) => s.shown === null));
});

test("26. unmatched historical value is never remapped (buildQuestionResults excludes it upstream)", () => {
  // A source built only from canonical option ids: a stray value would not appear.
  const g = groupStudyResults([A])[0];
  const ids = g.sources[0].options.map((o) => o.optionId).sort();
  assert.deepEqual(ids, ["1", "2", "3", "4"]);
});

// ── MIXED STUDY (historical + studio-native) ─────────────────────────────────
test("31,32. a Study mixing historical + studio-native combines when identities match", () => {
  const hist = survey("A", "Hist", [q(0, "qk", "Q", { "1": 10, "2": 10 }, ["1", "2"])], ["qk"], "historical");
  const nativ = survey("B", "Native", [q(0, "qk", "Q", { "1": 5, "2": 15 }, ["1", "2"])], ["qk"], "studio_native");
  const g = groupStudyResults([hist, nativ])[0];
  assert.equal(g.comparability, "combined");
  assert.equal(g.combined!.base, 40);
  // Both modes retained on their sources — never fused into one mode.
  assert.deepEqual(g.sources.map((s) => s.resultMode).sort(), ["historical", "studio_native"]);
});

test("33,34. incompatible evidence stays separate; no source erases another", () => {
  const s1 = survey("A", "S1", [q(0, "qk", "Q", { "1": 5, "2": 5 }, ["1", "2"])], ["qk"]);
  const s2 = survey("B", "S2", [q(0, "qk", "Q", { "1": 5, "9": 5 }, ["1", "9"])], ["qk"]);
  const g = groupStudyResults([s1, s2])[0];
  assert.equal(g.comparability, "side_by_side");
  assert.equal(g.sources.length, 2); // both preserved
});

// Group ordering is deterministic (first-seen across surveys, then question index).
test("determinism: group order follows first appearance across surveys", () => {
  const s1 = survey("A", "S1", [q(0, "kA", "A", { "1": 1 }, ["1"]), q(1, "kB", "B", { "1": 1 }, ["1"])], ["kA", "kB"]);
  const s2 = survey("B", "S2", [q(0, "kB", "B", { "1": 1 }, ["1"]), q(1, "kC", "C", { "1": 1 }, ["1"])], ["kB", "kC"]);
  const keys = groupStudyResults([s1, s2]).map((g) => g.canonicalQuestionKey);
  assert.deepEqual(keys, ["kA", "kB", "kC"]);
});
