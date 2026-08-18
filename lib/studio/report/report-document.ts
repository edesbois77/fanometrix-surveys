// ── Survey Studio — Reports V1 (Slice 3) — Editorial document (pure) ─────────
// The intermediate EDITORIAL layer between the verified composition and the renderer.
// A report is a small set of EDITORIAL PAGES; each page is a finite PAGE ARCHETYPE built
// from a finite set of governed EVIDENCE MODULES. The AI chose the story + archetype; the
// SERVER builds the module data from governed evidence here (never model numbers); the
// renderer owns layout/print. This is the "research story → editorial pages → modules"
// shape — page count is EDITORIALLY determined, not one-per-finding.

import { stripInlineRefs } from "@/lib/studio/study-analysis";
import {
  buildDistributionChart, buildKeyNumbers, buildHeroStat,
  type ComposedReport, type ReportComposerInput, type ReportGovernance, type ReportInputFinding,
} from "@/lib/studio/report/report-domain";

// ── Finite evidence-module vocabulary (server-populated, governed) ───────────
export type StatTile = { value: string; label: string; detail?: string; emphasis?: boolean };
export type ReportModule =
  | { kind: "hero-stat"; stat: StatTile }
  | { kind: "key-numbers"; stats: StatTile[] }
  | { kind: "distribution"; question: string; n: number; ranked?: boolean; note?: string; options: { label: string; pct: number; count: number; highlight?: boolean }[] }
  | { kind: "audience-comparison"; caption: string; points: { label: string; pct: number | null; value?: string }[] }
  | { kind: "finding-callout"; title: string; body: string }
  | { kind: "insight-text"; text: string }
  | { kind: "implications"; items: string[] }
  | { kind: "bottom-line"; text: string }
  | { kind: "methodology"; lines: string[] };
export type ModuleKind = ReportModule["kind"];

// ── Finite page-archetype vocabulary ─────────────────────────────────────────
export type PageArchetype = "executive" | "distribution-story" | "audience-comparison" | "ranked-priorities" | "key-numbers" | "narrative" | "implications";
export type EditorialPage = { archetype: PageArchetype; kicker?: string; chapter?: string; headline: string; interpretation?: string; modules: ReportModule[] };
export type CoverMode = "full" | "compact" | "none";
export type StudyReportDocument = {
  kind: "studio-report-document-v1";
  title: string; objective: string;
  coverMode: CoverMode;
  meta: { totalResponses: number; markets: string[]; surveys: number };
  pages: EditorialPage[];
};

// Structural budgets (the composer is also prompted + verified against word budgets).
const MAX_HERO_STATS = 4;
const MAX_IMPLICATIONS = 4;

const clean = (s: string) => stripInlineRefs(s); // defence-in-depth (verify already rejects ref leaks)
const chapter = (i: number) => String(i).padStart(2, "0");

/** Map a theme's archetype → its governed primary module (or null → prose fallback). */
function primaryModule(archetype: string, finding: ReportInputFinding | undefined, gov: ReportGovernance, number: string): ReportModule | null {
  if (!finding) return null;
  if (archetype === "distribution" || archetype === "ranked") {
    const q = buildDistributionChart(finding, gov, number, archetype === "ranked");
    if (q) return { kind: "distribution", question: q.title, n: q.n, ranked: archetype === "ranked", note: q.note, options: q.options.map((o) => ({ label: o.label, pct: o.pct, count: o.count, highlight: o.highlight })) };
  }
  if (archetype === "audience-comparison") {
    const spec = gov.segmentComparisons.get(finding.id);
    if (spec) return { kind: "audience-comparison", caption: spec.caption, points: spec.points };
  }
  if (archetype === "hero-stat") { const s = buildHeroStat(finding); if (s.length) return { kind: "hero-stat", stat: s[0] as StatTile }; }
  if (archetype === "key-numbers") { const s = buildKeyNumbers(finding); if (s.length) return { kind: "key-numbers", stats: s as StatTile[] }; }
  return null;
}

/** The strongest governed hero statistics across the whole study (for the executive page). */
function executiveHeroStats(input: ReportComposerInput): StatTile[] {
  const seen = new Set<string>();
  const stats: StatTile[] = [];
  const bases = input.findings.flatMap((f) => f.evidence.filter((e) => e.class === "base" && e.percentage != null))
    .sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0));
  for (const e of bases) {
    const key = e.optionLabel ?? e.question;
    if (seen.has(key)) continue; seen.add(key);
    stats.push({ value: `${Math.round((e.percentage ?? 0) * 1000) / 10}%`, label: e.optionLabel ?? "", detail: e.count != null && e.base != null ? `${e.count} of ${e.base}` : undefined });
    if (stats.length >= MAX_HERO_STATS) break;
  }
  return stats;
}

const ARCHETYPE_KICKER: Record<string, string> = { distribution: "The evidence", ranked: "What matters most", "audience-comparison": "By audience", "hero-stat": "The evidence", "key-numbers": "The evidence", narrative: "In depth" };
const PAGE_ARCHETYPE: Record<string, PageArchetype> = { distribution: "distribution-story", ranked: "ranked-priorities", "audience-comparison": "audience-comparison", "hero-stat": "key-numbers", "key-numbers": "key-numbers", narrative: "narrative" };

/**
 * Build the editorial document from the VERIFIED composition. Reuses the governed visual
 * builders; never introduces a number. Page count follows the story, not the finding count:
 * one executive page, one page per theme-story, and a final "what this means" page that
 * carries the implications + a compact methodology note.
 */
export function buildStudyReportDocument(c: ComposedReport, input: ReportComposerInput, gov: ReportGovernance): StudyReportDocument {
  const findingById = new Map(input.findings.map((f) => [f.id, f]));
  const pages: EditorialPage[] = [];

  // 1. Executive page — the answer + the strongest governed numbers (no repeated finding cards).
  pages.push({
    archetype: "executive", kicker: "Executive summary", chapter: chapter(1),
    headline: clean(c.executive.headline), interpretation: clean(c.executive.summary),
    modules: (() => { const s = executiveHeroStats(input); return s.length ? [{ kind: "key-numbers", stats: s }] as ReportModule[] : []; })(),
  });

  // 2. Theme pages — one editorial story each, led by its governed visual (or prose fallback).
  c.themes.forEach((t, i) => {
    const cf = t.chartFindingId ? findingById.get(t.chartFindingId) : t.findingIds.map((id) => findingById.get(id)).find(Boolean);
    const primary = primaryModule(t.archetype, cf, gov, chapter(i + 1));
    const modules: ReportModule[] = [];
    if (primary) modules.push(primary);
    // A single short supporting callout (a DIFFERENT finding than the visualised one) — never a card dump.
    const support = t.findingIds.map((id) => findingById.get(id)).find((f) => f && f.id !== cf?.id && f.commentary);
    if (support) modules.push({ kind: "finding-callout", title: clean(support.headline), body: clean(support.commentary ?? "") });
    if (!primary && !support) modules.push({ kind: "insight-text", text: clean(t.interpretation) });
    pages.push({ archetype: PAGE_ARCHETYPE[t.archetype] ?? "narrative", kicker: ARCHETYPE_KICKER[t.archetype] ?? "Key theme", chapter: chapter(i + 2), headline: clean(t.heading), interpretation: clean(t.interpretation), modules });
  });

  // 3. "What this means" — implications + compact methodology, on ONE final page.
  const total = input.methodology.totalResponses;
  const methodology: ReportModule = { kind: "methodology", lines: [
    `${total.toLocaleString()} completed responses${input.methodology.markets.length ? ` across ${input.methodology.markets.join(", ")}` : ""}.`,
    input.methodology.surveys.map((s) => `${s.name} (${s.responses.toLocaleString()})`).join(" · "),
    "Findings are human-curated; every figure is a governed survey result. Percentages are of completed responses per question.",
  ].filter(Boolean) };
  const implications = c.implications.slice(0, MAX_IMPLICATIONS).map((im) => clean(im.text));
  pages.push({
    archetype: "implications", kicker: "Implications", chapter: chapter(pages.length + 1), headline: "What this means",
    modules: [...(implications.length ? [{ kind: "implications", items: implications } as ReportModule] : []), methodology],
  });

  // Cover mode — a concise report starts on the executive page; a longer one earns a cover.
  const coverMode: CoverMode = pages.length >= 6 ? "full" : "compact";

  return {
    kind: "studio-report-document-v1", title: clean(c.title || input.study.title), objective: clean(input.study.objective), coverMode,
    meta: { totalResponses: total, markets: input.methodology.markets, surveys: input.methodology.surveys.length }, pages,
  };
}
