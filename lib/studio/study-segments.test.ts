import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSegmentDerived, MIN_SEGMENT_BASE, type SegmentQuestion } from "./study-segments";
import type { OptionResult } from "./survey-results";

const opt = (id: string, label: string, count: number, base: number): OptionResult => ({ optionId: id, label, count, percentage: base > 0 ? count / base : null });
const LABELS = { "1": "Access to experiences", "2": "Connecting football fans", "3": "Exclusive football content", "4": "Supporting local communities" };
const grp = (key: string, label: string, counts: Record<string, number>): { key: string; label: string; base: number; options: OptionResult[] } => {
  const base = Object.values(counts).reduce((a, b) => a + b, 0);
  return { key, label, base, options: Object.keys(LABELS).map((oid) => opt(oid, LABELS[oid as keyof typeof LABELS], counts[oid] ?? 0, base)) };
};

// Real FedEx Q3 "How could FedEx help fans most?" by country (Survey 1). Italy base 22 (< MIN).
const italy = grp("IT", "Italy", { "1": 9, "2": 4, "3": 4, "4": 5 });          // base 22 (excluded)
const france = grp("FR", "France", { "1": 18, "2": 7, "3": 11, "4": 15 });     // base 51, leads opt1
const spain = grp("ES", "Spain", { "1": 13, "2": 8, "3": 7, "4": 7 });         // base 35, leads opt1
const uk = grp("UK", "the UK", { "1": 7, "2": 18, "3": 11, "4": 7 });          // base 43, leads opt2  ← reversal
const germany = grp("DE", "Germany", { "1": 14, "2": 12, "3": 14, "4": 4 });   // base 44, leads opt1 (tie→first)
const qualifying = [france, spain, uk, germany];
const pooled = (oid: string) => qualifying.reduce((n, g) => n + (g.options.find((o) => o.optionId === oid)?.count ?? 0), 0);
const poolBase = qualifying.reduce((n, g) => n + g.base, 0);
const q3: SegmentQuestion = {
  canonicalQuestionKey: "q_help", question: "How could FedEx help fans most?", dimension: "country",
  overall: Object.keys(LABELS).map((oid) => opt(oid, LABELS[oid as keyof typeof LABELS], pooled(oid), poolBase)),
  overallBase: poolBase,
  groups: [italy, france, spain, uk, germany],
};
const derived = buildSegmentDerived("STU", [q3]);
const byKind = (k: string) => derived.filter((d) => d.kind === k);

test("A. small groups (base < 30) are excluded from the comparison", () => {
  // Italy (22) must not appear as a leading/anchor group in any fact detail.
  const mentionsItaly = derived.some((d) => JSON.stringify(d.detail).includes("Italy") || d.label.includes("Italy"));
  assert.equal(mentionsItaly, false);
  assert.ok(MIN_SEGMENT_BASE === 30);
});

test("F. leader reversal is detected — UK breaks the overall pattern", () => {
  const rev = byKind("seg_reversal")[0];
  assert.ok(rev, "a reversal fact should exist");
  assert.match(rev.label, /Access to experiences/); // the dominant answer elsewhere
  assert.match(rev.label, /Connecting football fans/); // the UK breaker
  assert.match(rev.label, /the UK respondents/);
  assert.equal(rev.dimension, "country");
});

test("E. cross-segment spread is computed with pp magnitude (Connecting fans widest, highest in UK)", () => {
  const spreads = byKind("seg_spread");
  const connecting = spreads.find((s) => (s.detail.option as string) === "Connecting football fans");
  assert.ok(connecting, "connecting-fans spread should surface");
  assert.equal(connecting!.detail.highest, "the UK");     // 41.9% in UK
  assert.ok((connecting!.value as number) >= 12);
  assert.doesNotMatch(connecting!.label, /significant|caused|because/i); // descriptive only
});

test("H. concentration: an option disproportionately chosen in one audience is surfaced neutrally", () => {
  const conc = byKind("seg_concentration")[0];
  assert.ok(conc);
  assert.match(conc.label, /respondents, compared with .*% overall/);
  assert.match(conc.label, /among|of the UK|of France|of Spain|of Germany|of the UK respondents|UK respondents/);
});

test("G. consistency is detected when every group shares the leader", () => {
  // Q where all groups lead the same option → consistency, not reversal.
  const consistentQ: SegmentQuestion = {
    canonicalQuestionKey: "q_x", question: "Qx", dimension: "country",
    overall: [opt("1", "A", 60, 120), opt("2", "B", 60, 120)],
    overallBase: 120,
    groups: [grp2("FR", "France", { "1": 30, "2": 10 }), grp2("DE", "Germany", { "1": 28, "2": 12 }), grp2("UK", "the UK", { "1": 25, "2": 15 })],
  };
  const d = buildSegmentDerived("STU", [consistentQ]);
  const c = d.find((x) => x.kind === "seg_consistency");
  assert.ok(c, "consistency fact expected");
  assert.match(c!.label, /consistent across all 3 countrys/);
});

test("B/C. fewer than 2 qualifying groups → no comparison fabricated", () => {
  const single: SegmentQuestion = { canonicalQuestionKey: "q_s", question: "Qs", dimension: "country", overall: [opt("1", "A", 40, 40)], overallBase: 40, groups: [grp2("UK", "the UK", { "1": 40, "2": 0 }), grp2("IT", "Italy", { "1": 5, "2": 5 })] };
  assert.deepEqual(buildSegmentDerived("STU", [single]), []); // only UK qualifies (≥30) → <2 groups → nothing
});

test("6,7. derivation is deterministic + refs are dimension-tagged", () => {
  const again = buildSegmentDerived("STU", [q3]);
  assert.deepEqual(again.map((d) => d.ref), derived.map((d) => d.ref));
  assert.ok(derived.every((d) => d.ref.includes("dim#country")));
});

test("I. dimension identity is preserved (country ≠ survey) and tags the ref + label", () => {
  const surveyDim: SegmentQuestion = { ...q3, dimension: "survey", groups: [france, spain, uk, germany].map((g) => ({ ...g })) };
  const d = buildSegmentDerived("STU", [surveyDim]);
  assert.ok(d.every((x) => x.dimension === "survey"));
  assert.ok(d.every((x) => x.ref.includes("dim#survey")));
  // and country facts are tagged country (from the top-level `derived`)
  assert.ok(derived.every((x) => x.dimension === "country"));
});

test("Q. when segments are identical, no difference is manufactured (only consistency)", () => {
  const same = (label: string) => grp2(label, label, { "1": 20, "2": 20 }); // every group identical
  const flat: SegmentQuestion = { canonicalQuestionKey: "q_flat", question: "Qf", dimension: "country", overall: [opt("1", "A", 60, 120), opt("2", "B", 60, 120)], overallBase: 120, groups: [same("France"), same("Germany"), same("the UK")] };
  const d = buildSegmentDerived("STU", [flat]);
  assert.equal(d.filter((x) => x.kind === "seg_spread" || x.kind === "seg_concentration" || x.kind === "seg_reversal").length, 0);
  assert.ok(d.some((x) => x.kind === "seg_consistency")); // consistency is legitimately surfaced
});

// tiny 2-option group helper for the consistency/threshold fixtures
function grp2(key: string, label: string, counts: Record<string, number>) {
  const base = Object.values(counts).reduce((a, b) => a + b, 0);
  return { key, label, base, options: ["1", "2"].map((oid) => opt(oid, oid === "1" ? "A" : "B", counts[oid] ?? 0, base)) };
}
