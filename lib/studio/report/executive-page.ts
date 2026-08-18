// ── Survey Studio — Reports V1 (Slice A.2) — Executive Editorial Page (pure) ──
// ONE reusable page archetype (the first of the adaptive report). Purpose: in ~20 seconds tell
// the reader why the Study was run, the central conclusion, the strongest governed evidence, and
// what it means — then stop. Editorial hierarchy is explicit: OBJECTIVE → conclusion HEADLINE →
// WHAT WE FOUND (interpretation) → EVIDENCE (hero + governed chart) → BOTTOM LINE (what it means)
// → compact methodology. The AI (executive composer) owns the words + editorial choices; the
// SERVER owns every number here. Versioned `studio-exec-report-v1` so persisted Slice-3 documents
// keep loading (the renderer discriminates on `kind`).

import { stripInlineRefs } from "@/lib/studio/study-analysis";
import type { ReportComposerInput, ReportGovernance } from "@/lib/studio/report/report-domain";
import type { Stat } from "@/lib/reports/framework/types";
import { resolveVisualEvidence, primaryDistribution, studyHeroStats, type DistributionOption } from "@/lib/studio/report/visual-evidence";
import { assessRichness, type RichnessLevel } from "@/lib/studio/report/richness";
import { packModules, distributionWeight, A4_CONTENT_UNITS, type PackItem } from "@/lib/studio/report/packer";
import type { ExecutivePlan, HeroMode, BottomLineForm } from "@/lib/studio/report/executive-compose";

export type ExecCoverMode = "compact" | "full" | "none";
export type ExecModule =
  | { kind: "distribution"; question: string; n: number; options: DistributionOption[]; note?: string }
  | { kind: "key-numbers"; stats: Stat[] };

export type ExecutiveReportDocument = {
  kind: "studio-exec-report-v1";
  masthead: { brand: string; kicker: string };
  identity: { title: string; objective: string };
  coverMode: ExecCoverMode;
  headline: string;
  hero: { mode: HeroMode; primary: Stat | null; tension: Stat | null; gap: { value: string; caption: string } | null; note: string | null };
  whatWeFound: string;
  modules: ExecModule[];                                  // packer-managed evidence (distribution, optional key-numbers)
  bottomLine: { text: string; form: BottomLineForm } | null;
  methodology: string;                                    // compact, client-facing (no internal jargon)
  footerTagline: string;
  richness: RichnessLevel;                                // internal planning data (not surfaced)
};

export const EXEC_BUDGETS = { whatWeFoundWords: 50, maxKeyNumbers: 3, maxChartOptions: 6 };
const HEADER_UNITS = 22;                                  // masthead + objective + headline + hero + synthesis
const clean = (s: string) => stripInlineRefs(s ?? "");
const pctOf = (s: string) => Number((s.match(/\d+(?:\.\d+)?/) ?? ["0"])[0]) || 0;
/** Deterministic percentage-point gap, 1 dp, trailing ".0" dropped (e.g. 2.6pp, 17pp). */
const fmtPP = (x: number) => { const r = Math.round(Math.abs(x) * 10) / 10; return `${Number.isInteger(r) ? r.toFixed(0) : r}pp`; };

export type BuildResult = { ok: boolean; document?: ExecutiveReportDocument; reasons?: string[] };

/** Resolve a hero option LABEL to a governed Stat (server owns the value). Prefers the shown
 *  distribution (on-page coherence), then any governed base stat. Returns null if not governed. */
function statForLabel(label: string | null | undefined, dist: ReturnType<typeof primaryDistribution>, baseStats: Stat[]): Stat | null {
  if (!label) return null;
  const o = dist?.options.find((x) => x.label === label);
  if (o) return { value: `${o.pct}%`, label: o.label, detail: `${o.count} of ${dist!.n} responses`, emphasis: true };
  const b = baseStats.find((s) => s.label === label);
  return b ? { ...b, emphasis: true } : null;
}

/**
 * Build the Executive page from a VERIFIED editorial plan + governed visual evidence. All hero
 * values are supplied here from governed data (never from the model). Returns not-ok only when
 * the material is insufficient — never partial output.
 */
export function buildExecutivePage(plan: ExecutivePlan, input: ReportComposerInput, gov: ReportGovernance): BuildResult {
  const richness = assessRichness(input, gov);
  if (richness.level === "insufficient") return { ok: false, reasons: ["insufficient governed material for a report", ...richness.reasons] };

  const ve = resolveVisualEvidence(input, gov);
  const dist = primaryDistribution(ve);
  const baseStats = studyHeroStats(ve, 6);
  const optByLabel = new Map((dist?.options ?? []).map((o) => [o.label, o]));
  const note = plan.hero?.note ? clean(plan.hero.note) : null;

  // Hero — server supplies ALL values from governed data (incl. the pp GAP, computed here from
  // two options of the SAME governed distribution — never the model). The plan chose mode + labels.
  let hero: ExecutiveReportDocument["hero"] = { mode: "none", primary: null, tension: null, gap: null, note: null };
  const mode = plan.hero?.mode;
  if (mode === "single") {
    const p = statForLabel(plan.hero.primaryOption, dist, baseStats);
    if (p) hero = { mode: "single", primary: p, tension: null, gap: null, note };
  } else if (mode === "tension") {
    const p = statForLabel(plan.hero.primaryOption, dist, baseStats);
    const t = statForLabel(plan.hero.tensionOption, dist, baseStats);
    if (p && t) {
      const po = optByLabel.get(p.label), to = optByLabel.get(t.label);
      const gap = po && to ? { value: fmtPP(po.pct - to.pct), caption: "separates them" } : null; // same-question, server-computed
      hero = { mode: "tension", primary: p, tension: t, gap, note };
    } else if (p) hero = { mode: "single", primary: p, tension: null, gap: null, note };
  } else if (mode === "dominance") {
    const p = statForLabel(plan.hero.primaryOption, dist, baseStats);
    const leader = p ? optByLabel.get(p.label) : undefined;
    const runnerUp = dist && leader ? dist.options.filter((o) => o.label !== leader.label).sort((a, b) => b.pct - a.pct)[0] : undefined;
    if (p && leader && runnerUp && leader.pct >= runnerUp.pct) {
      hero = { mode: "dominance", primary: p, tension: null, gap: { value: `+${fmtPP(leader.pct - runnerUp.pct)}`, caption: `ahead of “${runnerUp.label}”` }, note };
    } else if (p) hero = { mode: "single", primary: p, tension: null, gap: null, note };
  }

  // Primary governed visual — SHOW the full distribution the findings license.
  const distOptionLabels = new Set(dist?.options.map((o) => o.label) ?? []);
  const heroLabels = new Set([hero.primary?.label, hero.tension?.label].filter(Boolean) as string[]);

  // Key numbers — ONLY if they add something the chart/hero doesn't already show (no duplication).
  const complementary = baseStats.filter((s) => !distOptionLabels.has(s.label) && !heroLabels.has(s.label)).slice(0, EXEC_BUDGETS.maxKeyNumbers);

  const candidates: { item: PackItem; module: ExecModule }[] = [];
  if (dist) {
    // Chart highlighting follows the EDITORIAL PLAN, not "top-2/largest": emphasise exactly the
    // hero option(s) when they are in this distribution; a neutral chart when the hero is none;
    // otherwise fall back to the findings-driven emphasis the visual-evidence builder computed.
    const heroInDist = [...heroLabels].some((l) => distOptionLabels.has(l));
    const options = dist.options.slice(0, EXEC_BUDGETS.maxChartOptions).map((o) => ({
      ...o,
      highlight: hero.mode === "none" ? false : heroInDist ? heroLabels.has(o.label) : o.highlight,
    }));
    const note = dist.options.length > EXEC_BUDGETS.maxChartOptions ? `Top ${EXEC_BUDGETS.maxChartOptions} of ${dist.options.length} options shown.` : undefined;
    candidates.push({ item: { id: "distribution", weight: distributionWeight(options.length), priority: 100, required: true }, module: { kind: "distribution", question: dist.question, n: dist.n, options, note } });
  }
  if (complementary.length) candidates.push({ item: { id: "key-numbers", weight: 8, priority: 70, required: !dist }, module: { kind: "key-numbers", stats: complementary } });

  const pack = packModules(candidates.map((c) => c.item), A4_CONTENT_UNITS - HEADER_UNITS);
  const placed = new Set(pack.placed);
  const modules = candidates.filter((c) => placed.has(c.item.id)).map((c) => c.module);

  // Client-facing methodology — research language only, no internal/system jargon.
  const parts = [`${input.methodology.totalResponses.toLocaleString()} completed responses`];
  if (input.methodology.markets.length) parts.push(`${input.methodology.markets.length} market${input.methodology.markets.length === 1 ? "" : "s"}`);
  parts.push(`${input.methodology.surveys.length} survey${input.methodology.surveys.length === 1 ? "" : "s"}`);

  return {
    ok: true,
    document: {
      kind: "studio-exec-report-v1",
      masthead: { brand: "FANOMETRIX", kicker: "Survey Study Report" },
      identity: { title: clean(input.study.title), objective: clean(input.study.objective) },
      coverMode: "compact",
      headline: clean(plan.headline),
      hero,
      whatWeFound: clean(plan.whatWeFound),
      modules,
      bottomLine: plan.bottomLine?.text ? { text: clean(plan.bottomLine.text), form: plan.bottomLine.form } : null,
      methodology: parts.join(" · "),
      footerTagline: "Fan insight. Smarter strategy. Stronger impact.",
      richness: richness.level,
    },
  };
}

export { pctOf };
