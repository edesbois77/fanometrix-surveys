// ── Survey Studio — Reports V1 (Slice 2) — PURE domain ───────────────────────
// Reports COMPOSE human-approved Findings into a client-ready EDITORIAL document. They
// never re-analyse: claims come from Findings, proof from those Findings' FROZEN governed
// evidence (+ the pinned Analysis run for full distributions + governed segment facts for
// audience comparisons), organisation from the Study Story/themes.
//
// The AI is a senior EDITOR: it decides the story, the themes (conclusions, not
// categories), which findings group together, and — per theme — which ARCHETYPE best
// communicates the evidence. Fanometrix owns layout AND the numbers: every chart/stat is
// built server-side from governed evidence; the model never supplies a value. Anything the
// model cannot support governed falls back to prose rather than fabricating. This module is
// pure: input contract, readiness, deterministic verification, governed visual building,
// and the adapter that turns a verified composition into a framework `ReportConfig`.

import { bannedLanguageReasons, stripInlineRefs, containsInlineRef, crossQuestionComparisonReasons } from "@/lib/studio/study-analysis";
import type { ReportConfig, Section, Stat, SurveyQuestion, ChartOption, Finding as FrameworkFinding } from "@/lib/reports/framework/types";

// ── Input contract (what the composer may see — governed/approved only) ──────
export type ReportEvidenceClass = "base" | "derived" | "segment";
export type ReportInputEvidence = {
  ref: string; class: ReportEvidenceClass; label: string; question: string;
  canonicalQuestionKey: string | null; dimension: string | null;
  optionLabel: string | null; count: number | null; base: number | null; percentage: number | null;
};
export type ReportInputFinding = { id: string; headline: string; commentary: string | null; evidence: ReportInputEvidence[] };
export type ReportComposerInput = {
  study: { title: string; objective: string };
  findings: ReportInputFinding[];
  context: { story: { headline: string; summary: string } | null; themes: { title: string; interpretation: string }[] };
  methodology: { surveys: { name: string; responses: number }[]; totalResponses: number; markets: string[] };
  editorialBrief: string | null;
};

// ── Governed audience comparison (built server-side from a segment fact's detail) ──
export type ComparisonPoint = { label: string; pct: number | null; value?: string };
export type ComparisonSpec = { kind: "overall-vs-group" | "range" | "leaders"; caption: string; points: ComparisonPoint[] };

/** Turn a governed segment fact's structured `detail` into a comparison of GOVERNED values.
 *  Never infers a missing group value; returns null when the fact carries no comparable
 *  numbers (→ the report falls back to a prose observation). Dimension-agnostic. */
export function buildSegmentComparison(kind: string, detail: Record<string, unknown>, dimension: string): ComparisonSpec | null {
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const groupWord = dimension === "country" ? "market" : dimension;
  if (kind === "seg_concentration" && detail.group && num(detail.groupPct) != null && num(detail.overallPct) != null) {
    return { kind: "overall-vs-group", caption: `"${String(detail.option ?? "")}" — by ${groupWord}`,
      points: [{ label: String(detail.group), pct: num(detail.groupPct) }, { label: "Overall", pct: num(detail.overallPct) }] };
  }
  if (kind === "seg_spread" && detail.highest && detail.lowest && num(detail.max) != null && num(detail.min) != null) {
    return { kind: "range", caption: `"${String(detail.option ?? "")}" — highest vs lowest ${groupWord}`,
      points: [{ label: String(detail.highest), pct: num(detail.max) }, { label: String(detail.lowest), pct: num(detail.min) }] };
  }
  if (kind === "seg_reversal" && Array.isArray(detail.groups)) {
    const groups = detail.groups as { group?: string; leads?: string }[];
    if (groups.every((g) => g.group && g.leads)) return { kind: "leaders", caption: `Most-selected answer by ${groupWord}`, points: groups.map((g) => ({ label: String(g.group), pct: null, value: String(g.leads) })) };
  }
  return null; // consistency + anything without governed per-group numbers → prose
}

/** Server-side sidecar (NEVER shown to the model). Charts + verification draw from here. */
export type ReportGovernance = {
  findingIds: Set<string>;
  governedNumbers: Set<string>;
  distributions: Map<string, { question: string; options: { optionId: string; label: string; count: number; base: number; percentage: number | null }[] }>;
  segmentComparisons: Map<string, ComparisonSpec>;   // findingId → governed audience comparison (when available)
};

// ── Composer output (constrained; NO css/coords/numbers-as-truth) ────────────
// A theme is a CONCLUSION; the composer picks ONE archetype to communicate its evidence.
export const ALLOWED_ARCHETYPES = ["distribution", "key-numbers", "hero-stat", "audience-comparison", "narrative"] as const;
export type Archetype = (typeof ALLOWED_ARCHETYPES)[number];
export type ComposedTheme = { heading: string; interpretation: string; findingIds: string[]; archetype: Archetype; chartFindingId?: string };
export type ComposedReport = {
  title: string;
  executive: { headline: string; summary: string };
  themes: ComposedTheme[];
  implications: { text: string; findingIds: string[] }[];
};

// ── Readiness (deterministic gate before Generate is enabled) ────────────────
export type Readiness = { ok: boolean; reason?: string; findingCount: number };
export function reportReadiness(input: { objective?: string | null; findings: ReportInputFinding[] }): Readiness {
  const findings = input.findings ?? [];
  if (!input.objective || !input.objective.trim()) return { ok: false, reason: "Add a Study objective before generating a report.", findingCount: findings.length };
  if (findings.length === 0) return { ok: false, reason: "Add at least one insight to Findings before generating a report.", findingCount: 0 };
  const corrupt = findings.find((f) => !f.evidence || f.evidence.length === 0 || f.evidence.some((e) => !e.ref || !e.label));
  if (corrupt) return { ok: false, reason: `A selected finding has unresolvable evidence ("${corrupt.headline}"). Deselect it or re-add it from Analysis.`, findingCount: findings.length };
  return { ok: true, findingCount: findings.length };
}

// ── Governed-number extraction / verification ────────────────────────────────
const STAT_TOKEN = /\d+(?:\.\d+)?\s*(?:%|pp)|\b\d+\.\d+\b/g;
const normNum = (s: string) => s.replace(/\s+/g, "").replace(/pp$/i, "").replace(/%$/, "").replace(/\.0$/, "");
export function governedNumbersOf(findings: ReportInputFinding[]): Set<string> {
  const out = new Set<string>();
  for (const f of findings) for (const e of f.evidence) {
    for (const m of (e.label.match(STAT_TOKEN) ?? [])) out.add(normNum(m));
    if (e.percentage != null) out.add(normNum(`${Math.round(e.percentage * 1000) / 10}%`));
  }
  return out;
}
export function unsupportedNumbers(text: string, governed: Set<string>): string[] {
  return [...new Set((text.match(STAT_TOKEN) ?? []).map(normNum))].filter((n) => !governed.has(n));
}

// ── Content budgets (force editorial discipline) ─────────────────────────────
export const BUDGETS = { headlineWords: 14, execSummaryWords: 85, interpretationWords: 55, implicationWords: 30, maxImplications: 4, maxThemes: 5 };
const words = (s: string) => (s.trim().match(/\S+/g) ?? []).length;
// A conclusion-led headline must not read like a bare category label ("Key findings",
// "Sponsorship perceptions", "Market differences") — i.e. it must contain a verb / claim.
// Whole-string labels ONLY — anchored, never greedy: "Sponsorship perceptions" is a label,
// but "…can improve sponsorship perception" is a sentence and must NOT match.
const CATEGORY_HEADLINE = /^(?:key findings?|survey results?|findings|results|overview|introduction|background|context|market differences?|regional differences?|audience differences?|fan expectations?|fan engagement|sponsorship perceptions?|brand (?:perceptions?|visibility|awareness)|perceptions?|engagement|visibility|awareness|methodology|summary|conclusions?)\.?$/i;
const hasVerb = (s: string) => /\b(?:is|are|was|were|has|have|leads?|led|lags?|differs?|differ|varies|shows?|reveals?|suggests?|remains?|drives?|wants?|expect|need|should|offer|sits?|masks?|outpaces?|holds?|splits?|favou?rs?|prefers?|undermin\w+|limits?|earns?|struggles?|belongs?|watch\w*|views?|buys?|uses?|choose\w*|chose|trusts?|recognis\w+|recogniz\w+|value|rate)\b/i.test(s);
export function headlineIsCategory(h: string): boolean {
  const t = h.trim();
  if (CATEGORY_HEADLINE.test(t)) return true;
  return !hasVerb(t) && words(t) <= 3; // a very short verbless phrase is a label, not a conclusion
}

// ── Deterministic verification of a composed report ──────────────────────────
export type VerifyResult = { ok: boolean; reasons: string[] };
// A REPORT never claims statistical "significance" — no significance test is governed. The
// analysis-layer guard allows "significant portion/opportunity" as ordinary magnitude, but a
// CLIENT-FACING report should avoid the word entirely (it reads as an unsupported stats claim).
// Report-level only; does not touch Analysis/Findings governance.
export const REPORT_SIGNIFICANCE = /\bsignifican(?:t|tly|ce)\b/i;
export function reportProseReasons(text: string): string[] {
  return REPORT_SIGNIFICANCE.test(text)
    ? ['avoid "significant/significantly" — no statistical test is governed; use an exact figure or neutral magnitude wording (e.g. "around a quarter")']
    : [];
}
function proseReasons(text: string, gov: ReportGovernance, distinctQuestions = 1): string[] {
  const r: string[] = [];
  if (containsInlineRef(text)) r.push("internal evidence ref leaked into prose");
  r.push(...bannedLanguageReasons(text));
  r.push(...reportProseReasons(text));
  r.push(...crossQuestionComparisonReasons(text, distinctQuestions));
  const bad = unsupportedNumbers(text, gov.governedNumbers);
  if (bad.length) r.push(`unsupported statistic(s) not backed by a Finding: ${bad.join(", ")}`);
  return r;
}
/** Story-level overlap: two headlines that share most content words tell the same story. */
function contentWords(s: string): Set<string> {
  const stop = new Set(["the", "and", "for", "with", "from", "into", "that", "this", "are", "its", "but", "not", "how", "why", "what", "across", "among", "their", "than", "then"]);
  return new Set((s.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !stop.has(w)));
}
function jaccard(a: Set<string>, b: Set<string>): number { if (!a.size || !b.size) return 0; let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i); }
export function verifyComposedReport(c: ComposedReport, input: ReportComposerInput, gov: ReportGovernance): VerifyResult {
  const reasons: string[] = [];
  const known = (ids: string[]) => ids.every((id) => gov.findingIds.has(id));
  const distinctQ = new Set(input.findings.flatMap((f) => f.evidence.map((e) => e.canonicalQuestionKey).filter(Boolean))).size;
  const prose = (t: string) => proseReasons(t, gov, distinctQ);
  if (!c.title?.trim()) reasons.push("missing report title");
  if (!c.executive?.headline?.trim()) reasons.push("missing executive headline");
  if (!c.executive?.summary?.trim()) reasons.push("missing executive summary");
  else {
    reasons.push(...prose(`${c.executive.headline}\n${c.executive.summary}`));
    if (words(c.executive.headline) > BUDGETS.headlineWords) reasons.push(`executive headline is too long (>${BUDGETS.headlineWords} words) — tighten it`);
    if (words(c.executive.summary) > BUDGETS.execSummaryWords) reasons.push(`executive summary is too long (>${BUDGETS.execSummaryWords} words) — synthesise, don't list`);
    if (headlineIsCategory(c.executive.headline)) reasons.push(`the executive headline is a category label, not a conclusion — say what the research concluded`);
  }
  if (!Array.isArray(c.themes) || c.themes.length === 0) reasons.push("a report needs at least one theme");
  if ((c.themes?.length ?? 0) > BUDGETS.maxThemes) reasons.push(`too many themes (>${BUDGETS.maxThemes}) — group related findings into fewer stories`);
  // Editorial dedup — two themes must not rest on the SAME finding set NOR retell the same story.
  const sig = (ids: string[]) => [...new Set(ids)].sort().join(",");
  const seen = new Set<string>();
  const headings: string[] = [];
  for (const t of c.themes ?? []) {
    if (!t.heading?.trim() || !t.interpretation?.trim()) reasons.push("a theme is missing heading/interpretation");
    if (!Array.isArray(t.findingIds) || t.findingIds.length === 0) reasons.push(`theme "${t.heading}" cites no findings`);
    else if (!known(t.findingIds)) reasons.push(`theme "${t.heading}" cites a finding that was not selected`);
    else { const s = sig(t.findingIds); if (seen.has(s)) reasons.push(`two themes rest on the same finding set — merge them into one story`); seen.add(s); }
    if (!ALLOWED_ARCHETYPES.includes(t.archetype)) reasons.push(`theme "${t.heading}" uses an unknown archetype "${t.archetype}"`);
    if (t.chartFindingId && !t.findingIds?.includes(t.chartFindingId)) reasons.push(`theme "${t.heading}" charts a finding it does not cite`);
    if (t.heading && headlineIsCategory(t.heading)) reasons.push(`theme headline "${t.heading}" is a category label, not a conclusion`);
    if (t.heading && words(t.heading) > BUDGETS.headlineWords) reasons.push(`theme headline "${t.heading}" is too long`);
    if (t.interpretation && words(t.interpretation) > BUDGETS.interpretationWords) reasons.push(`theme "${t.heading}" interpretation is too long (>${BUDGETS.interpretationWords} words)`);
    // Story-level redundancy: a later theme heading that mostly repeats an earlier one.
    for (const prev of headings) if (t.heading && jaccard(contentWords(prev), contentWords(t.heading)) >= 0.6) reasons.push(`theme "${t.heading}" repeats an earlier theme — one story, not two`);
    if (t.heading) headings.push(t.heading);
    reasons.push(...prose(`${t.heading}\n${t.interpretation}`));
    // Chart data availability is NOT a hard failure — the builder falls back to prose (never fabricates).
  }
  if ((c.implications?.length ?? 0) > BUDGETS.maxImplications) reasons.push(`too many implications (>${BUDGETS.maxImplications})`);
  for (const im of c.implications ?? []) {
    if (!im.text?.trim()) reasons.push("an implication is empty");
    if (im.text && words(im.text) > BUDGETS.implicationWords) reasons.push(`an implication is too long (>${BUDGETS.implicationWords} words)`);
    if (!Array.isArray(im.findingIds) || im.findingIds.length === 0 || !known(im.findingIds)) reasons.push(`implication "${(im.text ?? "").slice(0, 40)}…" is not grounded in a selected finding`);
    reasons.push(...prose(im.text ?? ""));
  }
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

// ── Governed visual building (server owns numbers; model only picks the archetype) ──
function distributionForFinding(f: ReportInputFinding | undefined, gov: ReportGovernance) {
  if (!f) return null;
  const qk = f.evidence.map((e) => e.canonicalQuestionKey).find(Boolean);
  return qk ? gov.distributions.get(qk) ?? null : null;
}
export function buildDistributionChart(f: ReportInputFinding, gov: ReportGovernance, number: string, ranked = false): SurveyQuestion | null {
  const dist = distributionForFinding(f, gov);
  if (!dist) return null;
  const mentions = `${f.evidence.map((e) => e.label).join(" ")} ${f.commentary ?? ""}`.toLowerCase();
  let options: ChartOption[] = dist.options.map((o) => ({ label: o.label, count: o.count, pct: Math.round((o.percentage ?? 0) * 1000) / 10, highlight: f.evidence.some((e) => e.optionLabel === o.label) || mentions.includes(o.label.toLowerCase()) }));
  if (ranked) options = [...options].sort((a, b) => b.pct - a.pct);
  const note = f.evidence.find((e) => e.class !== "base")?.label;
  return { id: f.id, number, title: dist.question, n: dist.options[0]?.base ?? 0, options, note, keyInsight: f.commentary ?? undefined };
}
export function buildKeyNumbers(f: ReportInputFinding): Stat[] {
  return f.evidence.filter((e) => e.class === "base" && e.percentage != null).slice(0, 4).map((e) => ({
    value: `${Math.round((e.percentage ?? 0) * 1000) / 10}%`, label: e.optionLabel ?? e.question,
    detail: e.count != null && e.base != null ? `${e.count} of ${e.base}` : undefined,
  }));
}
/** One dominant governed statistic (the largest base % the finding cites). */
export function buildHeroStat(f: ReportInputFinding): Stat[] {
  const base = f.evidence.filter((e) => e.class === "base" && e.percentage != null).sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0))[0];
  if (!base) return [];
  return [{ value: `${Math.round((base.percentage ?? 0) * 1000) / 10}%`, label: base.optionLabel ?? base.question, detail: base.count != null && base.base != null ? `${base.count} of ${base.base} responses` : undefined, emphasis: true }];
}
/** Governed audience comparison → stat tiles (percentages) or labelled leaders. */
export function comparisonStats(spec: ComparisonSpec): Stat[] {
  return spec.points.slice(0, 5).map((p, i) => p.pct != null
    ? { value: `${p.pct}%`, label: p.label, emphasis: i === 0 }
    : { value: p.value ?? "—", label: p.label });
}

// ── Adapter — verified composition → framework ReportConfig ──────────────────
const clean = (s: string) => stripInlineRefs(s);
const chapter = (i: number) => String(i + 1).padStart(2, "0");
export function toReportConfig(c: ComposedReport, input: ReportComposerInput, gov: ReportGovernance): ReportConfig {
  const findingById = new Map(input.findings.map((f) => [f.id, f]));
  const sections: Section[] = [];
  const total = input.methodology.totalResponses;
  const markets = input.methodology.markets;

  // 1. Cover (deterministic)
  sections.push({
    type: "hero", id: "cover", eyebrow: "Fanometrix · Survey Studio", title: clean(c.title || input.study.title), subtitle: clean(input.study.objective),
    meta: { preparedBy: "Fanometrix", classification: "Study report", primaryResearch: `${total.toLocaleString()} completed responses${markets.length ? ` · ${markets.length} market${markets.length === 1 ? "" : "s"}` : ""}`,
      highlights: [{ value: total.toLocaleString(), label: "Completed responses" }, ...(markets.length ? [{ value: String(markets.length), label: "Markets" }] : []), { value: String(input.methodology.surveys.length), label: input.methodology.surveys.length === 1 ? "Survey" : "Surveys" }] },
  });

  // 2. Executive story (synthesis) + the strongest finding cards
  const topFindings: FrameworkFinding[] = c.themes.flatMap((t) => t.findingIds).filter((id, i, a) => a.indexOf(id) === i).slice(0, 4)
    .map((id, i) => { const f = findingById.get(id); return f ? { index: chapter(i), title: clean(f.headline), body: f.commentary ? clean(f.commentary) : undefined } : null; }).filter(Boolean) as FrameworkFinding[];
  sections.push({ type: "executive-summary", id: "exec", kicker: "Executive summary", navLabel: "Summary", tone: "grey", assessmentKicker: clean(c.executive.headline), assessment: clean(c.executive.summary), findings: topFindings });

  // 3. Themes — one section each, rendered by the composer's chosen ARCHETYPE, with a
  //    deterministic prose fallback whenever the governed visual isn't available.
  c.themes.forEach((t, i) => {
    const heading = clean(t.heading);
    const navLabel = heading.slice(0, 32);
    const cf = t.chartFindingId ? findingById.get(t.chartFindingId) : (t.findingIds.map((id) => findingById.get(id)).find(Boolean));
    const base = { id: `theme-${i + 1}`, chapter: chapter(i), kicker: "Key theme", navLabel, heading, lede: clean(t.interpretation) };
    let section: Section | null = null;

    if (t.archetype === "distribution" && cf) { const q = buildDistributionChart(cf, gov, chapter(i)); if (q) section = { ...base, type: "survey-evidence", questions: [q] }; }
    else if (t.archetype === "audience-comparison" && cf) { const spec = gov.segmentComparisons.get(cf.id); if (spec) section = { ...base, type: "stat-wall", lede: `${clean(t.interpretation)} ${spec.caption}`.trim(), stats: comparisonStats(spec) }; }
    else if (t.archetype === "hero-stat" && cf) { const s = buildHeroStat(cf); if (s.length) section = { ...base, type: "stat-wall", stats: s }; }
    else if (t.archetype === "key-numbers" && cf) { const s = buildKeyNumbers(cf); if (s.length) section = { ...base, type: "stat-wall", stats: s }; }

    if (!section) {
      // Prose fallback (narrative archetype, or a visual whose governed data wasn't available).
      const callouts = t.findingIds.map((id) => findingById.get(id)).filter(Boolean).map((f) => ({ title: clean(f!.headline), body: f!.commentary ? clean(f!.commentary) : "" }));
      section = { ...base, type: "insight", callouts };
    }
    sections.push(section);
  });

  // 4. Implications (grounded)
  if (c.implications.length) sections.push({
    type: "recommendations", id: "implications", kicker: "Implications", navLabel: "Implications", heading: "What this means",
    recommendations: c.implications.map((im, i) => ({ index: chapter(i), title: clean(im.text), supports: "Grounded in the study's approved findings" })),
  });

  // 5. Methodology (deterministic — never AI)
  const surveyLine = input.methodology.surveys.map((s) => `${s.name} (${s.responses.toLocaleString()} responses)`).join("; ");
  sections.push({
    type: "methodology", id: "methodology", kicker: "About the study", navLabel: "Methodology", tone: "grey", heading: "About this study",
    paragraphs: [
      `This report draws on ${total.toLocaleString()} completed survey responses${markets.length ? ` across ${markets.join(", ")}` : ""}.`,
      `Surveys: ${surveyLine || "—"}.`,
      "Findings are human-curated conclusions; every figure shown is a governed survey result, not a model estimate. Percentages are of completed responses to each question.",
    ],
  });

  return { slug: `studio/${input.study.title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60), documentTitle: clean(c.title || input.study.title), access: { id: "studio-report", passwordEnv: "" }, sections };
}
