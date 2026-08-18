import { test } from "node:test";
import assert from "node:assert/strict";
import {
  governedNumbersOf, verifyComposedReport, buildSegmentComparison, headlineIsCategory, BUDGETS,
  type ReportComposerInput, type ReportInputFinding, type ReportGovernance, type ComposedReport,
} from "./report-domain";
import { buildStudyReportDocument, type StudyReportDocument, type EditorialPage } from "./report-document";

// ── Part 25 — the EDITORIAL DOCUMENT layer (pages + finite modules) ───────────
// A deliberately NON-FedEx study (broadcaster satisfaction) — every assertion is generic:
// no country, no sponsorship, no fixed page count, no fixed number of findings.

const ev = (over: Partial<ReportInputFinding["evidence"][number]>): ReportInputFinding["evidence"][number] => ({
  ref: "r", class: "base", label: "x", question: "Q?", canonicalQuestionKey: "q1", dimension: null,
  optionLabel: null, count: null, base: null, percentage: null, ...over,
});
const F = (id: string, headline: string, commentary: string, evidence: ReportInputFinding["evidence"]): ReportInputFinding => ({ id, headline, commentary, evidence });

const F_A = F("f-a", "Live matches are the core reason to subscribe", "Live matches lead the field.", [ev({ ref: "b1", label: "Live matches: 58%", optionLabel: "Live matches", count: 290, base: 500, percentage: 0.58 })]);
const F_B = F("f-b", "Highlights are a valued secondary draw", "Highlights sit clearly behind live.", [ev({ ref: "b2", label: "Highlights: 22%", optionLabel: "Highlights", count: 110, base: 500, percentage: 0.22 })]);
const F_SEG = F("f-seg", "Younger viewers lean to mobile viewing", "Mobile is concentrated among under-25s.", [
  ev({ ref: "s1", class: "segment", dimension: "age band", canonicalQuestionKey: "q1", label: '"Mobile" is chosen by 61% of Under-25 respondents, compared with 34% overall' }),
]);
const F_QUAL = F("f-qual", "Trust in the brand is fragile", "Respondents describe trust as conditional and easily lost.", [
  ev({ ref: "d1", class: "derived", canonicalQuestionKey: "q2", label: 'The most-selected view of the brand is "conditional trust"' }),
]);

const input: ReportComposerInput = {
  study: { title: "Broadcaster Satisfaction Study", objective: "Understand why viewers subscribe and where satisfaction differs." },
  findings: [F_A, F_B, F_SEG, F_QUAL],
  context: { story: { headline: "Live is the engine", summary: "Live sport drives subscription." }, themes: [{ title: "Live", interpretation: "…" }] },
  methodology: { surveys: [{ name: "Wave 1", responses: 500 }], totalResponses: 500, markets: [] },
  editorialBrief: null,
};
const gov: ReportGovernance = {
  findingIds: new Set(input.findings.map((f) => f.id)),
  governedNumbers: governedNumbersOf(input.findings),
  distributions: new Map([["q1", { question: "Why do you subscribe?", options: [
    { optionId: "1", label: "Live matches", count: 290, base: 500, percentage: 0.58 },
    { optionId: "2", label: "Highlights", count: 110, base: 500, percentage: 0.22 },
    { optionId: "3", label: "Analysis", count: 60, base: 500, percentage: 0.12 },
    { optionId: "4", label: "Other", count: 40, base: 500, percentage: 0.08 },
  ] }]]),
  segmentComparisons: new Map([["f-seg", buildSegmentComparison("seg_concentration", { option: "Mobile", group: "Under-25", groupPct: 61, overallPct: 34 }, "age band")!]]),
};
const okComposed: ComposedReport = {
  title: "Broadcaster Satisfaction — What drives subscription",
  executive: { headline: "Live sport is the engine, but younger viewers watch differently", summary: "A majority subscribe for live matches, with highlights a clear secondary draw. Satisfaction is broadly healthy, though younger respondents lean markedly to mobile viewing." },
  themes: [
    { heading: "Live sport is the core reason to subscribe", interpretation: "Live matches lead, with highlights secondary.", findingIds: ["f-a", "f-b"], archetype: "distribution", chartFindingId: "f-a" },
    { heading: "Younger viewers watch differently", interpretation: "Mobile viewing is concentrated among younger respondents.", findingIds: ["f-seg"], archetype: "audience-comparison", chartFindingId: "f-seg" },
  ],
  implications: [{ text: "Protect the live proposition and invest in mobile for younger audiences.", findingIds: ["f-a", "f-seg"] }],
};

const doc = (c: ComposedReport, i = input, g = gov): StudyReportDocument => buildStudyReportDocument(c, i, g);
const themePages = (d: StudyReportDocument): EditorialPage[] => d.pages.filter((p) => p.archetype !== "executive" && p.archetype !== "implications");

// ── document shape / page vocabulary ──────────────────────────────────────────
test("document opens executive, closes on implications, is well-formed", () => {
  const d = doc(okComposed);
  assert.equal(d.kind, "studio-report-document-v1");
  assert.equal(d.pages[0].archetype, "executive");
  assert.equal(d.pages[d.pages.length - 1].archetype, "implications");
  assert.equal(d.pages[d.pages.length - 1].headline, "What this means");
  const ALLOWED = new Set(["executive", "distribution-story", "audience-comparison", "ranked-priorities", "key-numbers", "narrative", "implications"]);
  assert.ok(d.pages.every((p) => ALLOWED.has(p.archetype)));           // finite archetype vocabulary
});

test("every module is from the finite module vocabulary", () => {
  const ALLOWED = new Set(["hero-stat", "key-numbers", "distribution", "audience-comparison", "finding-callout", "insight-text", "implications", "bottom-line", "methodology"]);
  for (const p of doc(okComposed).pages) for (const m of p.modules) assert.ok(ALLOWED.has(m.kind), m.kind);
});

// ── page count is EDITORIALLY determined (not one-per-finding) ────────────────
test("N findings do NOT force N pages — page count follows the story", () => {
  // 4 findings, 2 stories → executive + 2 theme pages + implications = 4 pages, not 6.
  const d = doc(okComposed);
  assert.equal(themePages(d).length, 2);
  assert.equal(d.pages.length, 4);
});

test("two findings merged into one theme produce ONE story page (not two)", () => {
  const d = doc(okComposed);
  const live = themePages(d).find((p) => /live/i.test(p.headline))!;
  // f-a is charted; f-b appears as a single supporting callout on the SAME page — not its own page.
  assert.ok(live.modules.some((m) => m.kind === "distribution"));
  assert.ok(live.modules.some((m) => m.kind === "finding-callout"));
  assert.equal(themePages(d).filter((p) => /live|highlight/i.test(p.headline)).length, 1);
});

test("distinct stories get distinct pages", () => {
  const names = themePages(doc(okComposed)).map((p) => p.headline);
  assert.equal(new Set(names).size, names.length);
});

// ── visual-first: governed values only, server-owned ──────────────────────────
test("the executive page leads with governed key numbers taken from base evidence", () => {
  const exec = doc(okComposed).pages[0];
  const kn = exec.modules.find((m) => m.kind === "key-numbers");
  assert.ok(kn && kn.kind === "key-numbers");
  assert.ok(kn.stats.length <= 4 && kn.stats.length > 0);
  assert.equal(kn.stats[0].value, "58%");                              // strongest governed base %, server-derived
});

test("a distribution page carries a full governed chart with the finding's option highlighted", () => {
  const p = themePages(doc(okComposed)).find((x) => x.archetype === "distribution-story")!;
  const chart = p.modules.find((m) => m.kind === "distribution");
  assert.ok(chart && chart.kind === "distribution");
  assert.equal(chart.options.length, 4);
  assert.deepEqual(chart.options.map((o) => o.pct), [58, 22, 12, 8]);  // governed, not modelled
  assert.ok(chart.options.some((o) => o.highlight));
});

test("a segment finding becomes a governed audience-comparison (values from the frozen fact)", () => {
  const p = themePages(doc(okComposed)).find((x) => x.archetype === "audience-comparison")!;
  const cmp = p.modules.find((m) => m.kind === "audience-comparison");
  assert.ok(cmp && cmp.kind === "audience-comparison");
  assert.deepEqual(cmp.points.map((pt) => pt.pct), [61, 34]);
});

// ── weak visual → prose fallback, never a fabricated chart ────────────────────
test("an archetype with no governed data falls back to prose (no fabricated numbers)", () => {
  const composed: ComposedReport = { title: "T", executive: { headline: "Trust is fragile and easily lost", summary: "Respondents describe trust as conditional." }, themes: [{ heading: "Trust is conditional, not given", interpretation: "Trust is easily lost once broken.", findingIds: ["f-qual"], archetype: "distribution", chartFindingId: "f-qual" }], implications: [{ text: "Rebuild trust through consistency.", findingIds: ["f-qual"] }] };
  const p = themePages(doc(composed)).find((x) => /trust/i.test(x.headline))!;
  assert.ok(!p.modules.some((m) => m.kind === "distribution"));        // no fabricated chart
  assert.ok(p.modules.some((m) => m.kind === "insight-text"));         // fell back to prose
  assert.doesNotMatch(JSON.stringify(p), /"pct":/);
});

// ── methodology compaction + cover mode ───────────────────────────────────────
test("methodology is a single compact module on the final page", () => {
  const last = doc(okComposed).pages.at(-1)!;
  const meth = last.modules.find((m) => m.kind === "methodology");
  assert.ok(meth && meth.kind === "methodology");
  assert.ok(meth.lines.some((l) => /500 completed responses/.test(l)));
  assert.equal(doc(okComposed).pages.filter((p) => p.modules.some((m) => m.kind === "methodology")).length, 1);
});

test("cover mode: a concise report is compact; a long one earns a full cover", () => {
  assert.equal(doc(okComposed).coverMode, "compact");                  // 4 pages → compact
  const many: ComposedReport = { ...okComposed, themes: [
    { heading: "Live sport is the core reason to subscribe", interpretation: "Live leads.", findingIds: ["f-a"], archetype: "distribution", chartFindingId: "f-a" },
    { heading: "Highlights are a valued secondary draw", interpretation: "Highlights sit behind live.", findingIds: ["f-b"], archetype: "key-numbers", chartFindingId: "f-b" },
    { heading: "Younger viewers watch differently on mobile", interpretation: "Mobile skews young.", findingIds: ["f-seg"], archetype: "audience-comparison", chartFindingId: "f-seg" },
    { heading: "Trust in the brand is fragile and conditional", interpretation: "Trust is easily lost.", findingIds: ["f-qual"], archetype: "narrative" },
  ] };
  assert.equal(doc(many).coverMode, "full");                           // executive + 4 themes + implications = 6 → full
});

// ── implications compaction ───────────────────────────────────────────────────
test("implications are capped and never exceed the module budget", () => {
  const composed: ComposedReport = { ...okComposed, implications: Array.from({ length: 7 }, (_, i) => ({ text: `Action number ${i}.`, findingIds: ["f-a"] })) };
  const last = doc(composed).pages.at(-1)!;
  const imp = last.modules.find((m) => m.kind === "implications");
  assert.ok(imp && imp.kind === "implications");
  assert.ok(imp.items.length <= 4);
});

// ── ref leaks never reach the document ────────────────────────────────────────
test("inline refs are stripped from every page/module (defence in depth)", () => {
  const composed: ComposedReport = { ...okComposed, executive: { headline: "Live sport is the engine of subscription", summary: "Live leads (id=e5) with study#S markers." } };
  assert.doesNotMatch(JSON.stringify(doc(composed)), /id=e\d|study#/);
});

// ── headline quality gate (unit) ──────────────────────────────────────────────
test("headlineIsCategory rejects category labels and bare verbless phrases, accepts conclusions", () => {
  for (const label of ["Key findings", "Market differences", "Fan engagement", "Methodology", "Sponsorship perceptions"]) assert.equal(headlineIsCategory(label), true, label);
  for (const concl of ["Live sport is the reason viewers subscribe", "Younger viewers lean to mobile", "Recognition lags in one market"]) assert.equal(headlineIsCategory(concl), false, concl);
  // Regression: a full sentence that merely ENDS in a category noun must NOT be flagged (no greedy match).
  for (const concl of ["Enhancing fan experiences can improve sponsorship perception", "Local partnerships strengthen brand awareness", "A clearer message would lift engagement"]) assert.equal(headlineIsCategory(concl), false, concl);
});

// ── content budgets are enforced by the verifier the document is built from ───
test("content budgets: over-long headline / summary / interpretation / implication are rejected", () => {
  const long = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
  assert.ok(!verifyComposedReport({ ...okComposed, executive: { headline: long(BUDGETS.headlineWords + 2) + " leads", summary: okComposed.executive.summary } }, input, gov).ok);
  assert.ok(!verifyComposedReport({ ...okComposed, executive: { headline: okComposed.executive.headline, summary: long(BUDGETS.execSummaryWords + 5) + " leads" } }, input, gov).ok);
  assert.ok(!verifyComposedReport({ ...okComposed, themes: [{ ...okComposed.themes[0], interpretation: long(BUDGETS.interpretationWords + 5) + " leads" }] }, input, gov).ok);
  assert.ok(!verifyComposedReport({ ...okComposed, implications: [{ text: long(BUDGETS.implicationWords + 5) + " ship it", findingIds: ["f-a"] }] }, input, gov).ok);
});

test("too many themes (>budget) is rejected", () => {
  const t = okComposed.themes[0];
  const many = { ...okComposed, themes: Array.from({ length: BUDGETS.maxThemes + 1 }, (_, i) => ({ ...t, heading: `Distinct story number ${i} about subscribing`, findingIds: ["f-a"], chartFindingId: undefined })) };
  assert.ok(!verifyComposedReport(many, input, gov).ok);
});

// ── story-level dedup V2 (near-duplicate headlines are one story) ─────────────
test("near-duplicate theme headlines are rejected (progression, not repetition)", () => {
  const dup = { ...okComposed, themes: [
    { heading: "Live sport is the core reason viewers subscribe", interpretation: "Live leads.", findingIds: ["f-a"], archetype: "distribution" as const, chartFindingId: "f-a" },
    { heading: "Live sport is the main reason viewers subscribe", interpretation: "Live still leads.", findingIds: ["f-b"], archetype: "key-numbers" as const, chartFindingId: "f-b" },
  ] };
  const v = verifyComposedReport(dup, input, gov);
  assert.equal(v.ok, false); assert.ok(v.reasons.some((r) => /repeats an earlier theme|one story/.test(r)));
});
