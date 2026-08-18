// ── Survey Studio — Reports V1 (Slice B) — Evidence & Opportunity page (pure) ──
// PAGE 2 of the adaptive infographic report: a dense, grid-composed page that combines MULTIPLE
// governed stories (how the picture varies + the opportunity) into ONE coherent editorial page —
// never "one finding = one section". The AI (evidence composer) owns the words; the SERVER owns
// every value and builds the module data from governed evidence here. Subject-neutral: the
// segment module works for ANY dimension (country / age / gender / wave / …), never special-cased.

import { stripInlineRefs } from "@/lib/studio/study-analysis";
import { buildDistributionChart, type ReportComposerInput, type ReportGovernance, type ComparisonSpec, type ReportInputFinding } from "@/lib/studio/report/report-domain";
import type { EvidencePlan } from "@/lib/studio/report/evidence-compose";

// ── Generic segment/audience comparison module (dimension-agnostic) ──────────
export type SegmentComparisonModule = {
  kind: "segment-comparison";
  mode: "leaders" | "overall-vs-group" | "range";   // matches the governed ComparisonSpec.kind
  caption: string;
  points: { label: string; pct: number | null; value?: string }[];
};
export type RankedDistributionModule = {
  kind: "ranked-distribution";
  question: string; n: number;
  options: { label: string; pct: number; count: number; highlight?: boolean }[];
  leadNote?: string;                                 // server-computed, e.g. "…leads by 8.3pp"
};
export type EvidenceModule = SegmentComparisonModule | RankedDistributionModule;

export type EvidenceReportDocument = {
  kind: "studio-evidence-report-v1";
  masthead: { brand: string; kicker: string };
  identity: { title: string };
  eyebrow: string;
  headline: string;
  intro: string;
  modules: EvidenceModule[];                         // grid-arranged by the renderer
  implications: string[];                            // "what this means"
  methodology: string;
  footerTagline: string;
};

const MAX_EVIDENCE_MODULES = 4;
const clean = (s: string) => stripInlineRefs(s ?? "");
const fmtPP = (x: number) => { const r = Math.round(Math.abs(x) * 10) / 10; return `${Number.isInteger(r) ? r.toFixed(0) : r}pp`; };
const specKind = (s: ComparisonSpec): SegmentComparisonModule["mode"] => (s.kind === "overall-vs-group" ? "overall-vs-group" : s.kind === "range" ? "range" : "leaders");

/** Distinct question keys a selected finding cites AND that have a governed full distribution. */
function showableQuestionKeys(input: ReportComposerInput, gov: ReportGovernance): Set<string> {
  const s = new Set<string>();
  for (const f of input.findings) for (const e of f.evidence) if (e.canonicalQuestionKey && gov.distributions.has(e.canonicalQuestionKey)) s.add(e.canonicalQuestionKey);
  return s;
}
function findingForQuestion(input: ReportComposerInput, qk: string): ReportInputFinding | undefined {
  return input.findings.find((f) => f.evidence.some((e) => e.canonicalQuestionKey === qk));
}

export type AvailableEvidence = {
  segments: { caption: string; spec: ComparisonSpec }[];
  distributions: { questionKey: string; question: string; finding: ReportInputFinding }[];
};

/** Governed stories available for the Evidence page, excluding question(s) already shown (Page 1). */
export function availableEvidence(input: ReportComposerInput, gov: ReportGovernance, excludeQuestionKeys: Set<string> = new Set()): AvailableEvidence {
  const segSeen = new Set<string>();
  const segments: AvailableEvidence["segments"] = [];
  for (const spec of gov.segmentComparisons.values()) {
    const key = `${spec.kind}|${spec.caption}|${spec.points.map((p) => `${p.label}:${p.pct ?? p.value}`).join(",")}`;
    if (segSeen.has(key)) continue; segSeen.add(key);
    segments.push({ caption: spec.caption, spec });
  }
  const distributions: AvailableEvidence["distributions"] = [];
  for (const qk of showableQuestionKeys(input, gov)) {
    if (excludeQuestionKeys.has(qk)) continue;
    const f = findingForQuestion(input, qk);
    if (f) distributions.push({ questionKey: qk, question: gov.distributions.get(qk)!.question, finding: f });
  }
  return { segments, distributions };
}

/** Human descriptions of the stories Page 2 will show (for the composer's context — no numbers). */
export function describeStories(avail: AvailableEvidence): string[] {
  return [
    ...avail.segments.map((s) => `Audience comparison: ${s.caption}`),
    ...avail.distributions.map((d) => `Full response distribution for: ${d.question}`),
  ];
}

export type BuildResult = { ok: boolean; document?: EvidenceReportDocument; reasons?: string[]; overflow?: number };

export function buildEvidencePage(
  plan: EvidencePlan, input: ReportComposerInput, gov: ReportGovernance, opts: { excludeQuestionKeys?: Set<string> } = {},
): BuildResult {
  const avail = availableEvidence(input, gov, opts.excludeQuestionKeys ?? new Set());
  if (!avail.segments.length && !avail.distributions.length) return { ok: false, reasons: ["no distinct governed evidence for a second page"] };

  const modules: EvidenceModule[] = [];
  // Segment comparisons first (how the picture varies) — governed values only, dimension-agnostic.
  for (const s of avail.segments) {
    modules.push({ kind: "segment-comparison", mode: specKind(s.spec), caption: s.caption, points: s.spec.points });
  }
  // Then ranked distributions (the opportunity/detail) — full governed chart, server-owned values.
  for (const d of avail.distributions) {
    const chart = buildDistributionChart(d.finding, gov, "01", true);
    if (!chart || !chart.options.length) continue;
    const opts2 = chart.options.map((o) => ({ label: o.label, pct: o.pct, count: o.count, highlight: o.highlight }));
    const [top, second] = opts2;
    const leadNote = top && second ? `“${top.label}” leads by ${fmtPP(top.pct - second.pct)}` : undefined;
    modules.push({ kind: "ranked-distribution", question: chart.title, n: chart.n, options: opts2, leadNote });
  }
  const overflow = Math.max(0, modules.length - MAX_EVIDENCE_MODULES);
  const shown = modules.slice(0, MAX_EVIDENCE_MODULES);

  const parts = [`${input.methodology.totalResponses.toLocaleString()} completed responses`];
  if (input.methodology.markets.length) parts.push(`${input.methodology.markets.length} market${input.methodology.markets.length === 1 ? "" : "s"}`);
  parts.push(`${input.methodology.surveys.length} survey${input.methodology.surveys.length === 1 ? "" : "s"}`);

  return {
    ok: true, overflow,
    document: {
      kind: "studio-evidence-report-v1",
      masthead: { brand: "FANOMETRIX", kicker: "Survey Study Report" },
      identity: { title: clean(input.study.title) },
      eyebrow: "Evidence & opportunity",
      headline: clean(plan.headline),
      intro: clean(plan.intro),
      modules: shown,
      implications: plan.implications.slice(0, 3).map((im) => clean(im.text)),
      methodology: parts.join(" · "),
      footerTagline: "Fan insight. Smarter strategy. Stronger impact.",
    },
  };
}
