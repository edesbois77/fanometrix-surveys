import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reportReadiness, governedNumbersOf, unsupportedNumbers, verifyComposedReport, toReportConfig,
  buildDistributionChart, buildKeyNumbers, buildHeroStat, buildSegmentComparison, comparisonStats, ALLOWED_ARCHETYPES,
  type ReportComposerInput, type ReportInputFinding, type ReportGovernance, type ComposedReport,
} from "./report-domain";

const ev = (over: Partial<ReportInputFinding["evidence"][number]>): ReportInputFinding["evidence"][number] => ({
  ref: "r", class: "base", label: "x", question: "Q?", canonicalQuestionKey: "q1", dimension: null,
  optionLabel: null, count: null, base: null, percentage: null, ...over,
});
const F = (id: string, headline: string, commentary: string, evidence: ReportInputFinding["evidence"]): ReportInputFinding => ({ id, headline, commentary, evidence });

// A deliberately NON-FedEx study (broadcaster satisfaction) — proves generic behaviour.
const F_A = F("f-a", "Live matches are the core reason to subscribe", "Live matches lead at 58%.", [ev({ ref: "b1", label: "Live matches: 58% (290 of 500)", optionLabel: "Live matches", count: 290, base: 500, percentage: 0.58 })]);
const F_B = F("f-b", "Highlights are a valued secondary draw", "Highlights at 22%.", [ev({ ref: "b2", label: "Highlights: 22% (110 of 500)", optionLabel: "Highlights", count: 110, base: 500, percentage: 0.22 })]);
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
  executive: { headline: "Live sport is the engine, but younger viewers watch differently", summary: "A majority subscribe for live matches, with highlights a clear secondary draw. Satisfaction is broadly healthy, though younger respondents lean markedly to mobile viewing. The priority is protecting the live proposition while investing in the mobile experience for younger audiences." },
  themes: [
    { heading: "Live sport is the core reason to subscribe", interpretation: "Live matches lead, with highlights secondary.", findingIds: ["f-a", "f-b"], archetype: "distribution", chartFindingId: "f-a" },
    { heading: "Younger viewers watch differently", interpretation: "Mobile viewing is concentrated among younger respondents.", findingIds: ["f-seg"], archetype: "audience-comparison", chartFindingId: "f-seg" },
  ],
  implications: [{ text: "Protect the live proposition and invest in mobile for younger audiences.", findingIds: ["f-a", "f-seg"] }],
};

// ── readiness ────────────────────────────────────────────────────────────────
test("readiness: no findings / no objective / corrupt evidence all fail; valid passes", () => {
  assert.equal(reportReadiness({ objective: "o", findings: [] }).ok, false);
  assert.equal(reportReadiness({ objective: "", findings: input.findings }).ok, false);
  assert.equal(reportReadiness({ objective: "o", findings: [F("x", "bad", "", [])] }).ok, false);
  assert.equal(reportReadiness({ objective: "o", findings: input.findings }).ok, true);
});

// ── verification / governance ─────────────────────────────────────────────────
test("a well-grounded composition passes verification", () => { assert.equal(verifyComposedReport(okComposed, input, gov).ok, true, verifyComposedReport(okComposed, input, gov).reasons.join(" | ")); });
test("unknown archetype is rejected", () => {
  assert.ok(!ALLOWED_ARCHETYPES.includes("pie" as never));
  assert.equal(verifyComposedReport({ ...okComposed, themes: [{ ...okComposed.themes[0], archetype: "pie" as never }] }, input, gov).ok, false);
});
test("a theme citing a non-selected finding is rejected", () => {
  const v = verifyComposedReport({ ...okComposed, themes: [{ heading: "H", interpretation: "I", findingIds: ["ghost"], archetype: "narrative" }] }, input, gov);
  assert.equal(v.ok, false); assert.ok(v.reasons.some((r) => /not selected/.test(r)));
});
test("an invented statistic in prose is rejected; governed numbers pass", () => {
  assert.deepEqual(unsupportedNumbers("live leads at 58%, highlights 22%", gov.governedNumbers), []);
  const v = verifyComposedReport({ ...okComposed, executive: { headline: "H", summary: "An invented 88.8% agreed." } }, input, gov);
  assert.equal(v.ok, false); assert.ok(v.reasons.some((r) => /unsupported statistic/.test(r) && /88\.8/.test(r)));
});
test("cross-question numeric gap + significance + causal + ref leak are rejected", () => {
  for (const summary of ["A gap between 58% live and 22% highlights.", "Live is significantly higher.", "Mobile use is caused by youth.", "Live leads (id=e1)."]) {
    assert.equal(verifyComposedReport({ ...okComposed, executive: { headline: "H", summary } }, input, gov).ok, false, summary);
  }
});
test("EDITORIAL DEDUP: two themes resting on the same finding set are rejected (one story)", () => {
  const dup = { ...okComposed, themes: [
    { heading: "A", interpretation: "i", findingIds: ["f-a"], archetype: "narrative" as const },
    { heading: "B", interpretation: "i", findingIds: ["f-a"], archetype: "hero-stat" as const, chartFindingId: "f-a" },
  ] };
  const v = verifyComposedReport(dup, input, gov);
  assert.equal(v.ok, false); assert.ok(v.reasons.some((r) => /same finding set/.test(r)));
});
test("brief-driven emphasis cannot introduce an ungoverned figure", () => {
  assert.equal(verifyComposedReport({ ...okComposed, executive: { headline: "H", summary: "An overwhelming 99% love it." } }, { ...input, editorialBrief: "stress 99%" }, gov).ok, false);
});

// ── governed visual building ──────────────────────────────────────────────────
test("distribution chart is built server-side, highlighting the finding's option", () => {
  const q = buildDistributionChart(F_A, gov, "01");
  assert.ok(q); assert.equal(q!.options.length, 4);
  assert.equal(q!.options.find((o) => o.label === "Live matches")!.pct, 58);
  assert.ok(q!.options.some((o) => o.highlight));
});
test("ranked distribution sorts by value", () => {
  const q = buildDistributionChart(F_A, gov, "01", true);
  assert.deepEqual(q!.options.map((o) => o.pct), [58, 22, 12, 8]);
});
test("key-numbers + hero-stat come from governed base evidence", () => {
  assert.equal(buildKeyNumbers(F_A)[0].value, "58%");
  const hero = buildHeroStat(F_A); assert.equal(hero[0].value, "58%"); assert.equal(hero[0].emphasis, true);
});

// ── segment comparisons (governed values only; never inferred) ────────────────
test("buildSegmentComparison: concentration → overall-vs-group; spread → range; reversal → leaders; consistency → null", () => {
  const conc = buildSegmentComparison("seg_concentration", { option: "Mobile", group: "Under-25", groupPct: 61, overallPct: 34 }, "age band")!;
  assert.equal(conc.kind, "overall-vs-group"); assert.deepEqual(conc.points.map((p) => p.pct), [61, 34]);
  const range = buildSegmentComparison("seg_spread", { option: "X", min: 16, max: 42, highest: "the UK", lowest: "Germany" }, "country")!;
  assert.equal(range.kind, "range"); assert.deepEqual(range.points.map((p) => [p.label, p.pct]), [["the UK", 42], ["Germany", 16]]);
  const leaders = buildSegmentComparison("seg_reversal", { dominantOption: "A", groups: [{ group: "UK", leads: "A" }, { group: "DE", leads: "B" }] }, "country")!;
  assert.equal(leaders.kind, "leaders"); assert.deepEqual(leaders.points.map((p) => p.value), ["A", "B"]);
  assert.equal(buildSegmentComparison("seg_consistency", { option: "A", groups: [{ group: "UK" }] }, "country"), null);
});
test("segment comparison never fabricates a missing group value", () => {
  assert.equal(buildSegmentComparison("seg_concentration", { option: "X", group: "UK" /* no pcts */ }, "country"), null);
  const stats = comparisonStats(buildSegmentComparison("seg_concentration", { option: "Mobile", group: "Under-25", groupPct: 61, overallPct: 34 }, "age")!);
  assert.deepEqual(stats.map((s) => s.value), ["61%", "34%"]);
});

// ── adapter (framework config; known sections only; archetype → visual) ───────
test("adapter emits a valid framework ReportConfig with an audience-comparison stat-wall", () => {
  const cfg = toReportConfig(okComposed, input, gov);
  const allowed = new Set(["hero", "executive-summary", "survey-evidence", "stat-wall", "insight", "recommendations", "methodology", "closing"]);
  assert.ok(cfg.sections.every((s) => allowed.has(s.type)));
  assert.equal(cfg.sections[0].type, "hero");
  const dist = cfg.sections.find((s) => s.type === "survey-evidence"); assert.ok(dist);        // theme 1 → distribution
  const audience = cfg.sections.find((s) => s.id === "theme-2") as { type: string; stats?: { value: string; label: string }[] };
  assert.equal(audience.type, "stat-wall");                                                     // theme 2 → audience comparison visual
  assert.deepEqual(audience.stats!.map((s) => s.value), ["61%", "34%"]);                        // governed values
});
test("refs never leak into the rendered config (headings, navLabels, prose all stripped)", () => {
  const cfg = toReportConfig({ ...okComposed, themes: [{ heading: "H (id=e5)", interpretation: "study#S|q#x N", findingIds: ["f-a"], archetype: "narrative" }] }, input, gov);
  assert.doesNotMatch(JSON.stringify(cfg), /id=e\d|study#/);
});
test("methodology is deterministic", () => {
  const m = toReportConfig(okComposed, input, gov).sections.find((s) => s.type === "methodology") as { paragraphs?: string[] };
  assert.ok(m.paragraphs!.some((p) => /500 completed survey responses/.test(p)));
  assert.ok(m.paragraphs!.some((p) => /Wave 1 \(500 responses\)/.test(p)));
});

// ── GENERIC CAPABILITY FIXTURES (Part 13) — non-FedEx ─────────────────────────
// A — simple study: 2 findings, one story → short report, no artificial themes.
test("Fixture A (simple): a 1-theme report renders concise + valid", () => {
  const simpleInput: ReportComposerInput = { ...input, findings: [F_A, F_B] };
  const simpleGov: ReportGovernance = { ...gov, findingIds: new Set(["f-a", "f-b"]), segmentComparisons: new Map() };
  const composed: ComposedReport = { title: "T", executive: { headline: "Live sport is why viewers subscribe", summary: "A majority subscribe for live matches; highlights are secondary." }, themes: [{ heading: "Live is the reason to subscribe", interpretation: "Live leads.", findingIds: ["f-a", "f-b"], archetype: "distribution", chartFindingId: "f-a" }], implications: [{ text: "Protect the live proposition.", findingIds: ["f-a"] }] };
  assert.equal(verifyComposedReport(composed, simpleInput, simpleGov).ok, true);
  const cfg = toReportConfig(composed, simpleInput, simpleGov);
  assert.equal(cfg.sections.filter((s) => s.id?.startsWith("theme-")).length, 1); // no artificial extra themes
});
// B — audience-heavy: the audience comparison is a proper visual from governed values.
test("Fixture B (audience-heavy): segment finding becomes a governed comparison visual", () => {
  const composed: ComposedReport = { title: "T", executive: { headline: "Younger viewers watch on mobile", summary: "Mobile viewing is concentrated among younger respondents." }, themes: [{ heading: "Younger viewers lean to mobile", interpretation: "Mobile skews young.", findingIds: ["f-seg"], archetype: "audience-comparison", chartFindingId: "f-seg" }], implications: [{ text: "Invest in mobile.", findingIds: ["f-seg"] }] };
  const cfg = toReportConfig(composed, input, gov);
  const seg = cfg.sections.find((s) => s.id === "theme-1") as { type: string; stats?: { value: string }[] };
  assert.equal(seg.type, "stat-wall"); assert.deepEqual(seg.stats!.map((s) => s.value), ["61%", "34%"]);
});
// D — weak-visual: audience/distribution requested but no governed data → prose fallback, no fabricated chart.
test("Fixture D (weak visual): an archetype with no governed data falls back to prose (no fabricated chart)", () => {
  const composed: ComposedReport = { title: "T", executive: { headline: "Trust is fragile", summary: "Respondents describe trust as conditional." }, themes: [{ heading: "Trust is conditional", interpretation: "Trust is easily lost.", findingIds: ["f-qual"], archetype: "distribution", chartFindingId: "f-qual" }], implications: [{ text: "Rebuild trust.", findingIds: ["f-qual"] }] };
  const cfg = toReportConfig(composed, input, gov);
  const theme = cfg.sections.find((s) => s.id === "theme-1")!;
  assert.equal(theme.type, "insight");            // fell back to prose — f-qual has no q2 distribution
  assert.doesNotMatch(JSON.stringify(theme), /"pct":/); // no fabricated chart values
});
