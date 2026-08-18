import { test } from "node:test";
import assert from "node:assert/strict";
import {
  governedNumbersOf, buildSegmentComparison, reportProseReasons,
  type ReportComposerInput, type ReportInputFinding, type ReportGovernance,
} from "./report-domain";
import { assessRichness, computeSignals } from "./richness";
import { resolveVisualEvidence, canShowQuestion } from "./visual-evidence";
import { packModules, fits, distributionWeight, A4_CONTENT_UNITS } from "./packer";
import { verifyExecutivePlan, bottomLineIsGeneric, allowedHeroLabels, type ExecutivePlan } from "./executive-compose";
import { buildExecutivePage } from "./executive-page";

// ── Slice A.2 — Executive page (A+C language). NON-FedEx broadcaster study (proves reuse). ──
const ev = (over: Partial<ReportInputFinding["evidence"][number]>): ReportInputFinding["evidence"][number] => ({
  ref: "r", class: "base", label: "x", question: "Q?", canonicalQuestionKey: "q1", dimension: null,
  optionLabel: null, count: null, base: null, percentage: null, ...over,
});
const F = (id: string, headline: string, commentary: string, evidence: ReportInputFinding["evidence"]): ReportInputFinding => ({ id, headline, commentary, evidence });

const F_A = F("f-a", "Live matches are the core reason to subscribe", "Live matches lead.", [ev({ ref: "b1", label: "Live matches: 58%", optionLabel: "Live matches", count: 290, base: 500, percentage: 0.58 })]);
const F_B = F("f-b", "A notable share never engage with highlights", "Some never watch highlights.", [ev({ ref: "b2", label: "Never watch highlights: 22%", optionLabel: "Never watch highlights", count: 110, base: 500, percentage: 0.22 })]);
const F_SEG = F("f-seg", "Younger viewers lean to mobile", "Mobile skews young.", [ev({ ref: "s1", class: "segment", dimension: "age band", canonicalQuestionKey: "q2", label: '"Mobile" 61% of Under-25 vs 34% overall' })]);

const input: ReportComposerInput = {
  study: { title: "Broadcaster Satisfaction Study", objective: "Understand why viewers subscribe and where satisfaction differs." },
  findings: [F_A, F_B, F_SEG],
  context: { story: null, themes: [] },
  methodology: { surveys: [{ name: "Wave 1", responses: 500 }], totalResponses: 500, markets: ["UK", "IE"] },
  editorialBrief: null,
};
const gov: ReportGovernance = {
  findingIds: new Set(input.findings.map((f) => f.id)),
  governedNumbers: governedNumbersOf(input.findings),
  distributions: new Map([["q1", { question: "Why do you subscribe?", options: [
    { optionId: "1", label: "Live matches", count: 290, base: 500, percentage: 0.58 },
    { optionId: "2", label: "Never watch highlights", count: 110, base: 500, percentage: 0.22 },
    { optionId: "3", label: "Analysis", count: 60, base: 500, percentage: 0.12 },
    { optionId: "4", label: "Other", count: 40, base: 500, percentage: 0.08 },
  ] }]]),
  segmentComparisons: new Map([["f-seg", buildSegmentComparison("seg_concentration", { option: "Mobile", group: "Under-25", groupPct: 61, overallPct: 34 }, "age band")!]]),
};

// A valid governed plan (single hero). Labels are governed distribution options.
const plan: ExecutivePlan = {
  headline: "Live sport is the engine of subscription",
  whatWeFound: "A clear majority subscribe for live matches; a fifth never watch highlights. Younger viewers lean to mobile.",
  hero: { mode: "single", primaryOption: "Live matches", tensionOption: null },
  bottomLine: { text: "Live matches carry subscription, so protecting live rights is the decisive retention lever.", form: "implication" },
};

// ── Richness (unchanged) ──────────────────────────────────────────────────────
test("richness: small showable study is concise/standard; insufficient when unbacked", () => {
  assert.ok(["concise", "standard"].includes(assessRichness(input, gov).level));
  assert.equal(assessRichness({ ...input, study: { ...input.study, objective: "" } }, gov).level, "insufficient");
  assert.equal(computeSignals(input, gov).showableDistributions, 1);
});

// ── Visual-evidence + Finding-vs-Result boundary (unchanged) ─────────────────
test("13. an unrelated result cannot enter the page; a cited question can", () => {
  const govExtra: ReportGovernance = { ...gov, distributions: new Map([...gov.distributions, ["q_ghost", { question: "Unasked", options: [{ optionId: "1", label: "Z", count: 10, base: 20, percentage: 0.5 }] }]]) };
  const ve = resolveVisualEvidence(input, govExtra);
  assert.equal(canShowQuestion(ve, "q_ghost"), false);
  assert.equal(canShowQuestion(ve, "q1"), true);
});
test("9. hero values are server-owned (from governed evidence, not the model)", () => {
  const d = buildExecutivePage(plan, input, gov).document!;
  assert.equal(d.hero.primary!.value, "58%");                         // supplied by the server for "Live matches"
});

// ── Hero selection: not-first, none, single, tension, grouped safety ─────────
test("5,14. hero is chosen editorially (governed label) — a plan can hero a non-leading option", () => {
  const p2: ExecutivePlan = { ...plan, hero: { mode: "single", primaryOption: "Never watch highlights", tensionOption: null } };
  const d = buildExecutivePage(p2, input, gov).document!;
  assert.equal(d.hero.primary!.label, "Never watch highlights");
  assert.equal(d.hero.primary!.value, "22%");                         // server value, not "first/largest"
});
test("6. hero mode NONE renders a strong page with no hero", () => {
  const d = buildExecutivePage({ ...plan, hero: { mode: "none", primaryOption: null, tensionOption: null } }, input, gov).document!;
  assert.equal(d.hero.mode, "none"); assert.equal(d.hero.primary, null);
  assert.ok(d.headline && d.whatWeFound && d.modules.some((m) => m.kind === "distribution"));
});
test("7,8. tension hero shows two governed stats", () => {
  const p: ExecutivePlan = { ...plan, hero: { mode: "tension", primaryOption: "Live matches", tensionOption: "Never watch highlights" } };
  const d = buildExecutivePage(p, input, gov).document!;
  assert.equal(d.hero.mode, "tension");
  assert.equal(d.hero.primary!.value, "58%"); assert.equal(d.hero.tension!.value, "22%");
});
test("10,11. a hero option that is not a governed result is rejected (no computed groups)", () => {
  const bad: ExecutivePlan = { ...plan, hero: { mode: "single", primaryOption: "64.6% think it works", tensionOption: null } };
  const v = verifyExecutivePlan(bad, input, gov);
  assert.equal(v.ok, false); assert.ok(v.reasons.some((r) => /not a governed result/.test(r)));
  // and the builder degrades safely (no fabricated hero)
  assert.equal(buildExecutivePage(bad, input, gov).document!.hero.mode, "none");
});
test("allowed hero labels are exactly the governed options/stats", () => {
  const labels = allowedHeroLabels(input, gov);
  assert.ok(labels.has("Live matches") && labels.has("Never watch highlights"));
  assert.ok(!labels.has("Everything else invented"));
});

// ── Content quality: significance, synthesis budget, recommendation creep ────
test("1. unsupported 'significant' language is rejected in report prose", () => {
  assert.ok(reportProseReasons("a significant portion of fans").length > 0);
  const v = verifyExecutivePlan({ ...plan, whatWeFound: "A significant share subscribe for live matches." }, input, gov);
  assert.equal(v.ok, false); assert.ok(v.reasons.some((r) => /significant/.test(r)));
});
test("2. executive synthesis over budget is rejected", () => {
  const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
  assert.equal(verifyExecutivePlan({ ...plan, whatWeFound: long }, input, gov).ok, false);
});
test("3. recommendation creep in the synthesis is rejected", () => {
  const v = verifyExecutivePlan({ ...plan, whatWeFound: "Live matters most, so the broadcaster should invest in and enhance its mobile experience." }, input, gov);
  assert.equal(v.ok, false); assert.ok(v.reasons.some((r) => /recommendation language/.test(r)));
});
test("12. headline conclusion rule + budget", () => {
  assert.equal(verifyExecutivePlan({ ...plan, headline: "Survey results" }, input, gov).ok, false);
});

// ── Bottom line: genericness heuristic + form ────────────────────────────────
test("4. a generic Bottom Line is rejected; a specific one passes", () => {
  const generic: ExecutivePlan = { ...plan, bottomLine: { text: "The broadcaster should tailor engagement strategies to maximise reach.", form: "recommendation" } };
  assert.equal(verifyExecutivePlan(generic, input, gov).ok, false);
  assert.equal(verifyExecutivePlan(plan, input, gov).ok, true, verifyExecutivePlan(plan, input, gov).reasons.join("; "));
});
test("bottomLineIsGeneric heuristic: filler + no anchor = generic", () => {
  const anchors = new Set(["live", "subscription", "matches"]);
  assert.equal(bottomLineIsGeneric("Leverage synergies to optimise engagement strategies", anchors), true);
  assert.equal(bottomLineIsGeneric("Live matches are the decisive subscription lever", anchors), false);
});

// ── Chart + key-number dedup + packer ────────────────────────────────────────
test("12b. the full governed distribution is shown", () => {
  const d = buildExecutivePage(plan, input, gov).document!;
  const dist = d.modules.find((m) => m.kind === "distribution");
  assert.ok(dist && dist.kind === "distribution" && dist.options.length === 4);
  assert.deepEqual(dist.options.map((o) => o.pct), [58, 22, 12, 8]);
});
test("8. chart highlighting follows the editorial plan (hero), not top-2/largest", () => {
  const single = buildExecutivePage({ ...plan, hero: { mode: "single", primaryOption: "Analysis", tensionOption: null } }, input, gov).document!;
  const sd = single.modules.find((m) => m.kind === "distribution") as Extract<import("./executive-page").ExecModule, { kind: "distribution" }>;
  assert.deepEqual(sd.options.filter((o) => o.highlight).map((o) => o.label), ["Analysis"]); // the chosen hero, not the 58% leader
  const none = buildExecutivePage({ ...plan, hero: { mode: "none", primaryOption: null, tensionOption: null } }, input, gov).document!;
  const nd = none.modules.find((m) => m.kind === "distribution") as Extract<import("./executive-page").ExecModule, { kind: "distribution" }>;
  assert.equal(nd.options.some((o) => o.highlight), false);           // neutral chart when no hero
  const tension = buildExecutivePage({ ...plan, hero: { mode: "tension", primaryOption: "Live matches", tensionOption: "Never watch highlights" } }, input, gov).document!;
  const td = tension.modules.find((m) => m.kind === "distribution") as Extract<import("./executive-page").ExecModule, { kind: "distribution" }>;
  assert.deepEqual(td.options.filter((o) => o.highlight).map((o) => o.label).sort(), ["Live matches", "Never watch highlights"]);
});
test("14b. key numbers that merely duplicate the chart are omitted", () => {
  // All governed base stats here are options of the shown distribution → nothing complementary.
  const d = buildExecutivePage(plan, input, gov).document!;
  assert.ok(!d.modules.some((m) => m.kind === "key-numbers"));
});
test("packer fits the executive page and detects overflow", () => {
  const packed = packModules([{ id: "distribution", weight: distributionWeight(4), priority: 100, required: true }, { id: "key-numbers", weight: 8, priority: 70 }], A4_CONTENT_UNITS - 22);
  assert.ok(packed.placed.includes("distribution"));
  assert.equal(fits([{ id: "x", weight: 999, priority: 1 }], 40), false);
});

// ── Structure / client language ──────────────────────────────────────────────
test("15. objective appears distinctly from the title; both governed from the Study", () => {
  const d = buildExecutivePage(plan, input, gov).document!;
  assert.equal(d.identity.title, "Broadcaster Satisfaction Study");
  assert.equal(d.identity.objective, input.study.objective);
  assert.notEqual(d.identity.title, d.identity.objective);
});
test("16. client-facing methodology contains no implementation jargon", () => {
  const d = buildExecutivePage(plan, input, gov).document!;
  assert.doesNotMatch(d.methodology, /governed|frozen|evidence|analysis run|composer|human-curated/i);
  assert.match(d.methodology, /completed responses/);
});
test("18. no evidence refs leak into the page", () => {
  const d = buildExecutivePage({ ...plan, whatWeFound: "Live leads (id=e7) with study#S markers among viewers." }, input, gov).document!;
  assert.doesNotMatch(JSON.stringify(d), /id=e\d|study#/);
});

// ── Generic fixtures (no FedEx/sport/sponsorship/country assumptions) ────────
// ── A.4 — Hero Evidence infographic (modes, server-computed gap, note) ───────
const closeF = F("f-c1", "Views split between fit and doubt", "A close split between fit and doubt.", [
  ev({ ref: "c1", canonicalQuestionKey: "qc", label: "Strong fit: 33.6%", optionLabel: "Strong fit", count: 92, base: 274, percentage: 0.336 }),
  ev({ ref: "c2", canonicalQuestionKey: "qc", label: "Unclear: 31%", optionLabel: "Unclear", count: 85, base: 274, percentage: 0.31 }),
]);
const closeInput: ReportComposerInput = { ...input, findings: [closeF], methodology: { surveys: [{ name: "W", responses: 274 }], totalResponses: 274, markets: [] } };
const closeGov: ReportGovernance = {
  findingIds: new Set(["f-c1"]), governedNumbers: governedNumbersOf([closeF]), segmentComparisons: new Map(),
  distributions: new Map([["qc", { question: "How do you view it?", options: [
    { optionId: "1", label: "Strong fit", count: 92, base: 274, percentage: 0.336 },
    { optionId: "2", label: "Unclear", count: 85, base: 274, percentage: 0.31 },
    { optionId: "3", label: "Never noticed", count: 68, base: 274, percentage: 0.248 },
  ] }]]),
};
const closePlan: ExecutivePlan = { headline: "Views split between a strong fit and doubt", whatWeFound: "A plurality see a strong fit, but almost as many are unsure.", hero: { mode: "tension", primaryOption: "Strong fit", tensionOption: "Unclear", note: null }, bottomLine: { text: "The fit is real but the split with doubt is narrow, so the message must land harder.", form: "tension" } };

test("A.4 tension: the pp gap is server-computed from two same-question options (decimals kept)", () => {
  const d = buildExecutivePage(closePlan, closeInput, closeGov).document!;
  assert.equal(d.hero.mode, "tension");
  assert.equal(d.hero.primary!.value, "33.6%"); assert.equal(d.hero.tension!.value, "31%");
  assert.equal(d.hero.gap!.value, "2.6pp");                            // 33.6 − 31, server-owned, not the model
  assert.match(d.hero.gap!.caption, /separates/);
});
test("A.4 dominance: leader + lead over the runner-up, gap server-computed", () => {
  const dom = buildExecutivePage({ ...plan, hero: { mode: "dominance", primaryOption: "Live matches", tensionOption: null, note: null } }, input, gov).document!;
  assert.equal(dom.hero.mode, "dominance");
  assert.equal(dom.hero.primary!.value, "58%");
  assert.equal(dom.hero.gap!.value, "+36pp");                          // 58 − 22 (next highest), integer → no ".0"
  assert.match(dom.hero.gap!.caption, /Never watch highlights/);
});
test("A.4 dominance is rejected when the lead is a near-tie (that is a tension)", () => {
  const v = verifyExecutivePlan({ ...closePlan, hero: { mode: "dominance", primaryOption: "Strong fit", tensionOption: null, note: null } }, closeInput, closeGov);
  assert.equal(v.ok, false); assert.ok(v.reasons.some((r) => /dominance is not supported/.test(r))); // 33.6 vs 31 = 2.6pp
  // a genuinely clear lead is accepted
  assert.equal(verifyExecutivePlan({ ...plan, hero: { mode: "dominance", primaryOption: "Live matches", tensionOption: null, note: null } }, input, gov).ok, true);
});
test("A.4 none: no hero, no gap; page still strong", () => {
  const d = buildExecutivePage({ ...plan, hero: { mode: "none", primaryOption: null, tensionOption: null, note: null } }, input, gov).document!;
  assert.equal(d.hero.mode, "none"); assert.equal(d.hero.gap, null); assert.equal(d.hero.note, null);
});
test("A.4 an optional governed hero note passes through; a banned note is rejected", () => {
  const withNote = buildExecutivePage({ ...closePlan, hero: { ...closePlan.hero, note: "Permission to play is real; clarity is not yet equal." } }, closeInput, closeGov).document!;
  assert.match(withNote.hero.note!, /Permission to play/);
  assert.equal(verifyExecutivePlan({ ...closePlan, hero: { ...closePlan.hero, note: "A significant portion remain unsure." } }, closeInput, closeGov).ok, false);
});
test("A.4 hero numbers are never model-authored — the gap has no model field and comes from governed pcts", () => {
  // The plan carries labels + mode only; there is no numeric field the model could set.
  const p = closePlan.hero as Record<string, unknown>;
  assert.equal("gap" in p, false); assert.equal("value" in p, false);
});
test("A.4 long option labels + small percentages still build cleanly", () => {
  const longF = F("f-l", "A very specific minority view is worth noting", "Long label.", [ev({ ref: "l1", canonicalQuestionKey: "ql", label: "x", optionLabel: "This is an unusually long response option label that must wrap", count: 6, base: 274, percentage: 0.02 })]);
  const lInput: ReportComposerInput = { ...input, findings: [longF] };
  const lGov: ReportGovernance = { findingIds: new Set(["f-l"]), governedNumbers: governedNumbersOf([longF]), segmentComparisons: new Map(), distributions: new Map([["ql", { question: "Q", options: [
    { optionId: "1", label: "This is an unusually long response option label that must wrap", count: 6, base: 274, percentage: 0.02 },
    { optionId: "2", label: "Everyone else", count: 268, base: 274, percentage: 0.98 },
  ] }]]) };
  const d = buildExecutivePage({ headline: "A small minority hold a distinct view", whatWeFound: "Almost everyone agrees; a small minority do not.", hero: { mode: "single", primaryOption: "This is an unusually long response option label that must wrap", tensionOption: null, note: null }, bottomLine: { text: "The lone dissenting view is small but worth watching for change.", form: "caution" } }, lInput, lGov).document!;
  assert.equal(d.hero.primary!.value, "2%");
  const dist = d.modules.find((m) => m.kind === "distribution") as Extract<import("./executive-page").ExecModule, { kind: "distribution" }>;
  assert.ok(dist.options.some((o) => o.label.length > 40));
});

test("17a. Tiny study (2 findings, 1 question, no segments) → concise, shows the chart, hero none allowed", () => {
  const tiny: ReportComposerInput = { ...input, findings: [F_A, F_B], methodology: { surveys: [{ name: "W", responses: 500 }], totalResponses: 500, markets: [] } };
  const tGov: ReportGovernance = { ...gov, findingIds: new Set(["f-a", "f-b"]), segmentComparisons: new Map() };
  assert.equal(assessRichness(tiny, tGov).level, "concise");
  const d = buildExecutivePage({ ...plan, hero: { mode: "none", primaryOption: null, tensionOption: null } }, tiny, tGov).document!;
  assert.ok(d.modules.some((m) => m.kind === "distribution"));
});
test("17b. Limited-visual (qualitative) study → renders without fabricating a chart", () => {
  const qual = F("f-q", "Trust is fragile", "Trust is conditional.", [ev({ ref: "d1", class: "derived", canonicalQuestionKey: "q9", label: 'The most-selected view is "conditional trust"' })]);
  const qInput: ReportComposerInput = { ...input, findings: [qual] };
  const qGov: ReportGovernance = { findingIds: new Set(["f-q"]), governedNumbers: governedNumbersOf([qual]), distributions: new Map(), segmentComparisons: new Map() };
  const qPlan: ExecutivePlan = { headline: "Trust is conditional, not given", whatWeFound: "Respondents describe trust as conditional and easily lost once broken.", hero: { mode: "none", primaryOption: null, tensionOption: null }, bottomLine: { text: "Conditional trust means the brand promise must be met consistently or it erodes.", form: "caution" } };
  const d = buildExecutivePage(qPlan, qInput, qGov).document!;
  assert.ok(!d.modules.some((m) => m.kind === "distribution"));
  assert.doesNotMatch(JSON.stringify(d), /"pct":/);
  assert.ok(d.headline && d.whatWeFound && d.bottomLine);
});
