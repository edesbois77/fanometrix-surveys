// ── Survey Studio — Reports V1 (Slice A) — Governed Visual Evidence Contract ──
// The single, explicit representation of what a Report is allowed to SHOW. It bridges an
// approved Finding → its supporting governed evidence → chartable/result material, and it is
// the enforcement point for the Finding-vs-Result boundary:
//
//   FINDING            = permission to make a CLAIM.
//   GOVERNED RESULT    = material available to SHOW that approved claim.
//
// Rules (all enforced here):
//   1. Every visual value is server-owned (built by the governed builders; never model text).
//   2. Every visual item traces to a governed source (findingId + questionKey/ref provenance).
//   3. Visual evidence may EXPAND the proof for an approved Finding (e.g. show the FULL
//      distribution of a question the Finding cites, not just the one option it named).
//   4. Visual evidence may NOT introduce a question/segment no selected Finding cites — that
//      would be a new, unapproved analytical claim. `showableQuestionKeys` is that boundary.
//   5. Never infer a missing value; 6. never reconstruct an ungoverned matrix; 7. never allow
//      model-authored chart values. (Enforced by delegating to the governed builders only.)

import {
  buildDistributionChart, buildHeroStat, buildKeyNumbers,
  type ReportComposerInput, type ReportGovernance, type ReportInputFinding, type ComparisonSpec,
} from "@/lib/studio/report/report-domain";
import type { Stat } from "@/lib/reports/framework/types";

export type DistributionOption = { label: string; count: number; pct: number; highlight?: boolean };
export type VisualEvidenceItem =
  | { kind: "full-distribution"; findingId: string; questionKey: string; question: string; n: number; options: DistributionOption[] }
  | { kind: "hero-stat"; findingId: string; questionKey: string | null; stat: Stat }
  | { kind: "key-numbers"; findingId: string; stats: Stat[] }
  | { kind: "segment-comparison"; findingId: string; spec: ComparisonSpec };

export type VisualEvidenceSet = {
  /** Provenance boundary — the ONLY questions a report may visualise (any question a selected
   *  Finding cites). A distribution for a key not in here must never be shown. */
  showableQuestionKeys: Set<string>;
  items: VisualEvidenceItem[];
  byFinding: Map<string, VisualEvidenceItem[]>;
};

/** Distinct non-null question keys any selected finding cites — the showable boundary. */
function showableKeys(findings: ReportInputFinding[]): Set<string> {
  const s = new Set<string>();
  for (const f of findings) for (const e of f.evidence) if (e.canonicalQuestionKey) s.add(e.canonicalQuestionKey);
  return s;
}

/** The primary question a finding cites (for provenance on its hero stat). */
function findingQuestionKey(f: ReportInputFinding): string | null {
  return f.evidence.map((e) => e.canonicalQuestionKey).find((k): k is string => !!k) ?? null;
}

/** True only if `questionKey` is one a selected Finding cites — the Finding-vs-Result gate. */
export function canShowQuestion(set: VisualEvidenceSet, questionKey: string | null | undefined): boolean {
  return !!questionKey && set.showableQuestionKeys.has(questionKey);
}

/**
 * Resolve every governed visual a Study's approved findings license. Server-owned values only;
 * a distribution is emitted ONLY when its question is in the showable set (always true here,
 * since it is derived from the finding's own cited question — the gate matters for callers that
 * try to show an arbitrary question, which `canShowQuestion` rejects).
 */
export function resolveVisualEvidence(input: ReportComposerInput, gov: ReportGovernance): VisualEvidenceSet {
  const showableQuestionKeys = showableKeys(input.findings);
  const items: VisualEvidenceItem[] = [];
  const byFinding = new Map<string, VisualEvidenceItem[]>();
  const push = (fid: string, it: VisualEvidenceItem) => { items.push(it); (byFinding.get(fid) ?? byFinding.set(fid, []).get(fid)!).push(it); };

  for (const f of input.findings) {
    const chart = buildDistributionChart(f, gov, "01");
    const qk = findingQuestionKey(f);
    if (chart && qk && showableQuestionKeys.has(qk)) {
      push(f.id, { kind: "full-distribution", findingId: f.id, questionKey: qk, question: chart.title, n: chart.n, options: chart.options.map((o) => ({ label: o.label, count: o.count, pct: o.pct, highlight: o.highlight })) });
    }
    const hero = buildHeroStat(f);
    if (hero.length) push(f.id, { kind: "hero-stat", findingId: f.id, questionKey: qk, stat: hero[0] });
    const keys = buildKeyNumbers(f);
    if (keys.length) push(f.id, { kind: "key-numbers", findingId: f.id, stats: keys });
    const seg = gov.segmentComparisons.get(f.id);
    if (seg) push(f.id, { kind: "segment-comparison", findingId: f.id, spec: seg });
  }
  return { showableQuestionKeys, items, byFinding };
}

/** The single strongest full distribution to lead a page with (richest option set, then base). */
export function primaryDistribution(set: VisualEvidenceSet): Extract<VisualEvidenceItem, { kind: "full-distribution" }> | null {
  const dists = set.items.filter((i): i is Extract<VisualEvidenceItem, { kind: "full-distribution" }> => i.kind === "full-distribution");
  if (!dists.length) return null;
  return [...dists].sort((a, b) => (b.options.length - a.options.length) || (b.n - a.n))[0];
}

/** The strongest governed base statistics across the whole study (deduped by label). */
export function studyHeroStats(set: VisualEvidenceSet, max = 3): Stat[] {
  const seen = new Set<string>();
  const out: Stat[] = [];
  const pool = set.items.flatMap((i) => (i.kind === "hero-stat" ? [i.stat] : i.kind === "key-numbers" ? i.stats : []));
  const pct = (v: string) => Number(v.replace("%", "")) || 0;
  for (const s of [...pool].sort((a, b) => pct(b.value) - pct(a.value))) {
    if (seen.has(s.label)) continue; seen.add(s.label);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}
