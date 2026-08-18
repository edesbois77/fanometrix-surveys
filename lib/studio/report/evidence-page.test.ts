import { test } from "node:test";
import assert from "node:assert/strict";
import {
  governedNumbersOf, buildSegmentComparison,
  type ReportComposerInput, type ReportInputFinding, type ReportGovernance,
} from "./report-domain";
import { verifyEvidencePlan, type EvidencePlan, type EvidenceContext } from "./evidence-compose";
import { buildEvidencePage, availableEvidence, describeStories } from "./evidence-page";

// ── Slice B — Evidence page. NON-country segmentation (age band) proves genericity. ──
const ev = (over: Partial<ReportInputFinding["evidence"][number]>): ReportInputFinding["evidence"][number] => ({
  ref: "r", class: "base", label: "x", question: "Q?", canonicalQuestionKey: "q1", dimension: null,
  optionLabel: null, count: null, base: null, percentage: null, ...over,
});
const F = (id: string, headline: string, commentary: string, evidence: ReportInputFinding["evidence"]): ReportInputFinding => ({ id, headline, commentary, evidence });

const F_SUB = F("f-sub", "Live sport is the core reason to subscribe", "Live leads.", [ev({ ref: "b1", canonicalQuestionKey: "q1", label: "Live matches: 58%", optionLabel: "Live matches", count: 290, base: 500, percentage: 0.58 })]);
const F_VALUE = F("f-val", "Value is led by exclusive rewards", "Rewards lead what fans value.", [ev({ ref: "b2", canonicalQuestionKey: "q2", label: "Rewards: 41%", optionLabel: "Rewards", count: 205, base: 500, percentage: 0.41 })]);
const F_SEG = F("f-seg", "Younger and older viewers diverge on device", "Device use splits by age.", [ev({ ref: "s1", class: "segment", dimension: "age band", canonicalQuestionKey: "q1", label: "Most-selected answer differs by age band" })]);

const input: ReportComposerInput = {
  study: { title: "Broadcaster Satisfaction Study", objective: "Understand why viewers subscribe and what they value." },
  findings: [F_SUB, F_VALUE, F_SEG],
  context: { story: null, themes: [] },
  methodology: { surveys: [{ name: "Wave 1", responses: 500 }], totalResponses: 500, markets: [] },
  editorialBrief: null,
};
const gov: ReportGovernance = {
  findingIds: new Set(input.findings.map((f) => f.id)),
  governedNumbers: governedNumbersOf(input.findings),
  distributions: new Map([
    ["q1", { question: "Why do you subscribe?", options: [
      { optionId: "1", label: "Live matches", count: 290, base: 500, percentage: 0.58 },
      { optionId: "2", label: "Highlights", count: 110, base: 500, percentage: 0.22 },
      { optionId: "3", label: "Analysis", count: 60, base: 500, percentage: 0.12 },
      { optionId: "4", label: "Other", count: 40, base: 500, percentage: 0.08 },
    ] }],
    ["q2", { question: "What do you value most?", options: [
      { optionId: "1", label: "Rewards", count: 205, base: 500, percentage: 0.41 },
      { optionId: "2", label: "Access", count: 150, base: 500, percentage: 0.30 },
      { optionId: "3", label: "Community", count: 145, base: 500, percentage: 0.29 },
    ] }],
  ]),
  // Non-country segment: leading device by AGE BAND (generic dimension).
  segmentComparisons: new Map([["f-seg", buildSegmentComparison("seg_reversal", { dominantOption: "Mobile", groups: [{ group: "Under-25", leads: "Mobile" }, { group: "45+", leads: "TV" }] }, "age band")!]]),
};
const ctx: EvidenceContext = { page1Headline: "Live sport is the engine of subscription", shownStories: [] };
const plan: EvidencePlan = {
  headline: "What fans value differs by age and appetite",
  intro: "Beyond the topline, device use splits by age and value is led by rewards. The two point to different levers for different audiences.",
  implications: [
    { text: "Consider age-specific delivery, since device preference divides younger and older viewers.", findingIds: ["f-seg"] },
    { text: "Rewards lead what fans value, so a loyalty proposition may be worth testing.", findingIds: ["f-val"] },
  ],
};
const excludeQ1 = new Set(["q1"]);

// ── 1. archetype + no one-finding-per-section ────────────────────────────────
test("1,14. evidence page combines MULTIPLE governed stories, not one-finding-per-section", () => {
  const r = buildEvidencePage(plan, input, gov, { excludeQuestionKeys: excludeQ1 });
  assert.equal(r.ok, true, r.reasons?.join("; "));
  const d = r.document!;
  assert.equal(d.kind, "studio-evidence-report-v1");
  // one segment story + one distribution story on a single page (Q1 excluded as Page 1)
  assert.equal(d.modules.filter((m) => m.kind === "segment-comparison").length, 1);
  assert.equal(d.modules.filter((m) => m.kind === "ranked-distribution").length, 1);
  assert.ok(d.implications.length >= 1);
});

// ── 2–7. generic segment module across dimensions/modes ──────────────────────
test("3. leading-answer-by-segment mode (leaders), dimension-agnostic (age band)", () => {
  const d = buildEvidencePage(plan, input, gov, { excludeQuestionKeys: excludeQ1 }).document!;
  const seg = d.modules.find((m) => m.kind === "segment-comparison")!;
  assert.equal(seg.kind === "segment-comparison" && seg.mode, "leaders");
  assert.match(seg.kind === "segment-comparison" ? seg.caption : "", /age band/);
  if (seg.kind === "segment-comparison") assert.deepEqual(seg.points.map((p) => `${p.label}:${p.value}`), ["Under-25:Mobile", "45+:TV"]);
});
test("4. overall-vs-segment mode (concentration) renders governed percentages", () => {
  const g2: ReportGovernance = { ...gov, segmentComparisons: new Map([["f-seg", buildSegmentComparison("seg_concentration", { option: "Mobile", group: "Under-25", groupPct: 61, overallPct: 34 }, "age band")!]]) };
  const seg = buildEvidencePage(plan, input, g2, { excludeQuestionKeys: excludeQ1 }).document!.modules.find((m) => m.kind === "segment-comparison")!;
  assert.equal(seg.kind === "segment-comparison" && seg.mode, "overall-vs-group");
  if (seg.kind === "segment-comparison") assert.deepEqual(seg.points.map((p) => p.pct), [61, 34]);
});
test("5. highest-vs-lowest mode (range)", () => {
  const g3: ReportGovernance = { ...gov, segmentComparisons: new Map([["f-seg", buildSegmentComparison("seg_spread", { option: "Mobile", min: 16, max: 42, highest: "Under-25", lowest: "45+" }, "age band")!]]) };
  const seg = buildEvidencePage(plan, input, g3, { excludeQuestionKeys: excludeQ1 }).document!.modules.find((m) => m.kind === "segment-comparison")!;
  assert.equal(seg.kind === "segment-comparison" && seg.mode, "range");
});
test("6,7. no inferred/missing segment values — a consistency fact yields NO governed comparison", () => {
  const gNull: ReportGovernance = { ...gov, segmentComparisons: new Map() }; // seg_consistency → buildSegmentComparison returns null upstream
  const avail = availableEvidence(input, gNull, excludeQ1);
  assert.equal(avail.segments.length, 0);
  const d = buildEvidencePage(plan, input, gNull, { excludeQuestionKeys: excludeQ1 }).document!;
  assert.ok(!d.modules.some((m) => m.kind === "segment-comparison"));  // never fabricates a matrix
});

// ── 8,9,17. ranked distributions, server-owned values ────────────────────────
test("8,17. ranked distribution shows the full governed distribution sorted, server-owned values", () => {
  const seg = buildEvidencePage(plan, input, gov, { excludeQuestionKeys: excludeQ1 }).document!;
  const rk = seg.modules.find((m) => m.kind === "ranked-distribution");
  assert.ok(rk && rk.kind === "ranked-distribution");
  assert.deepEqual(rk.options.map((o) => o.pct), [41, 30, 29]);        // Q2, sorted desc, from gov
  assert.match(rk.leadNote ?? "", /leads by 11pp/);                    // 41 − 30, server-computed
});
test("9. two distributions can appear on one page when both are showable", () => {
  const d = buildEvidencePage(plan, input, gov, { excludeQuestionKeys: new Set() }).document!; // exclude nothing
  assert.equal(d.modules.filter((m) => m.kind === "ranked-distribution").length, 2); // q1 + q2
});

// ── 10. no Page-1 repetition ─────────────────────────────────────────────────
test("10. a page-2 headline that repeats the page-1 topline is rejected", () => {
  const v = verifyEvidencePlan({ ...plan, headline: "Live sport is the engine of subscription" }, input, gov, ctx);
  assert.equal(v.ok, false); assert.ok(v.reasons.some((r) => /repeats the page-1 topline/.test(r)));
});

// ── 11. implication calibration ──────────────────────────────────────────────
test("11. implications: budget + grounding + no significance", () => {
  assert.equal(verifyEvidencePlan({ ...plan, implications: [{ text: "x", findingIds: ["ghost"] }] }, input, gov, ctx).ok, false); // ungrounded
  assert.equal(verifyEvidencePlan({ ...plan, implications: [{ text: "A significant lift is likely.", findingIds: ["f-val"] }] }, input, gov, ctx).ok, false); // significance
  assert.equal(verifyEvidencePlan({ ...plan, implications: plan.implications.concat(plan.implications).concat(plan.implications) }, input, gov, ctx).ok, false); // >3
});

// ── 13. packer grid capacity / overflow ──────────────────────────────────────
test("13. evidence modules are capped at the page grid; overflow is reported", () => {
  const many: ReportComposerInput = { ...input, findings: [
    F("a", "A", "", [ev({ ref: "a", canonicalQuestionKey: "qa", label: "A 50%", optionLabel: "A", count: 5, base: 10, percentage: 0.5 })]),
    F("b", "B", "", [ev({ ref: "b", canonicalQuestionKey: "qb", label: "B 50%", optionLabel: "B", count: 5, base: 10, percentage: 0.5 })]),
    F("c", "C", "", [ev({ ref: "c", canonicalQuestionKey: "qc", label: "C 50%", optionLabel: "C", count: 5, base: 10, percentage: 0.5 })]),
    F("d", "D", "", [ev({ ref: "d", canonicalQuestionKey: "qd", label: "D 50%", optionLabel: "D", count: 5, base: 10, percentage: 0.5 })]),
    F("e", "E", "", [ev({ ref: "e", canonicalQuestionKey: "qe", label: "E 50%", optionLabel: "E", count: 5, base: 10, percentage: 0.5 })]),
  ] };
  const q = (k: string): [string, { question: string; options: { optionId: string; label: string; count: number; base: number; percentage: number | null }[] }] => [k, { question: k, options: [{ optionId: "1", label: "A", count: 5, base: 10, percentage: 0.5 }, { optionId: "2", label: "B", count: 5, base: 10, percentage: 0.5 }] }];
  const mGov: ReportGovernance = { findingIds: new Set(["a", "b", "c", "d", "e"]), governedNumbers: new Set(["50"]), segmentComparisons: new Map(), distributions: new Map([q("qa"), q("qb"), q("qc"), q("qd"), q("qe")]) };
  const r = buildEvidencePage(plan, many, mGov, {});
  assert.equal(r.document!.modules.length, 4);                          // capped
  assert.ok((r.overflow ?? 0) > 0);                                     // more remains → could justify another page
});

// ── 15,16. generic fixtures ──────────────────────────────────────────────────
test("15. generic non-country segmentation works (age band, no country anywhere)", () => {
  const d = buildEvidencePage(plan, input, gov, { excludeQuestionKeys: excludeQ1 }).document!;
  assert.doesNotMatch(JSON.stringify(d), /country|France|Germany|market/i);
});
test("16. no-segment study still yields an evidence page from distributions alone", () => {
  const noSeg: ReportGovernance = { ...gov, segmentComparisons: new Map() };
  const d = buildEvidencePage(plan, { ...input, findings: [F_SUB, F_VALUE] }, noSeg, { excludeQuestionKeys: excludeQ1 }).document!;
  assert.ok(d.modules.some((m) => m.kind === "ranked-distribution"));
  assert.ok(!d.modules.some((m) => m.kind === "segment-comparison"));
});
test("describeStories lists the governed stories for the composer (no numbers)", () => {
  const avail = availableEvidence(input, gov, excludeQ1);
  const desc = describeStories(avail);
  assert.ok(desc.some((s) => /Audience comparison/.test(s)));
  assert.ok(desc.some((s) => /Full response distribution/.test(s)));
  assert.ok(desc.every((s) => !/\d/.test(s)));                          // no numbers leaked to the model
});
test("no distinct governed evidence → no evidence page (page-worthiness)", () => {
  const onlyQ1: ReportComposerInput = { ...input, findings: [F_SUB] };
  const g1: ReportGovernance = { findingIds: new Set(["f-sub"]), governedNumbers: governedNumbersOf([F_SUB]), segmentComparisons: new Map(), distributions: new Map([["q1", gov.distributions.get("q1")!]]) };
  const r = buildEvidencePage(plan, onlyQ1, g1, { excludeQuestionKeys: excludeQ1 });
  assert.equal(r.ok, false);                                            // nothing distinct beyond Page 1
});
