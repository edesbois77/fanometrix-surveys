// ── Survey Studio — Audience/Segment Derived Evidence (pure) ─────────────────
// The analyst must test whether the overall Study story holds ACROSS audiences (country,
// survey audience, …). As with all arithmetic, the SERVER computes the segment facts; the
// model only cites/interprets them. This turns per-group governed distributions into safe,
// bounded, structural facts — leader reversal, cross-segment spread, cross-segment
// consistency, single-segment concentration — each with a deterministic ref, group + base
// provenance, and NEUTRAL descriptive wording (never significance, never causal, never a
// national-character claim: always "respondents in/among <group>").

import type { OptionResult } from "@/lib/studio/survey-results";

// "country" | "survey" | "publisher" are the Study Analysis dimensions (unchanged).
// "market" | "device" are ADDITIVE values used only by the single-survey Findings
// engine — Study Analysis never emits them, so its behaviour is unaffected.
export type SegmentDimension = "country" | "survey" | "publisher" | "market" | "device";

/** One group's governed distribution for a question (e.g. UK respondents on Q3). */
export type SegmentGroupDist = { key: string; label: string; base: number; options: OptionResult[] };

/** A question broken down by ONE dimension, with the pooled overall for reference. */
export type SegmentQuestion = {
  canonicalQuestionKey: string;
  question: string;
  dimension: SegmentDimension;
  overall: OptionResult[];
  overallBase: number;
  groups: SegmentGroupDist[];    // may include below-threshold groups; buildSegmentDerived filters
};

/** Structurally compatible with DerivedEvidenceItem (so it flows through the same citable /
 *  prompt / validator machinery), plus dimension identity. */
export type SegmentDerivedItem = {
  ref: string;
  kind: "seg_reversal" | "seg_consistency" | "seg_spread" | "seg_concentration";
  canonicalQuestionKey: string;
  question: string;
  dimension: SegmentDimension;
  label: string;
  value: number;
  unit: "pp" | "%" | "bool";
  inputRefs: string[];
  detail: Record<string, unknown>;
};

// ── Safety thresholds (Part 5) ───────────────────────────────────────────────
export const MIN_SEGMENT_BASE = 30;   // groups below this are excluded from comparison (too small)
export const MIN_SEGMENTS = 2;        // need ≥2 qualifying groups to compare at all
const SEG_SPREAD_MIN_PP = 12;         // a cross-segment option spread worth surfacing (descriptive, not sig)
const SEG_CONC_MIN_PP = 15;           // a single-segment deviation from overall worth surfacing
const SEG_SPREADS_PER_Q = 2;          // cap per question (avoid comparison spam / explosion)
export const MAX_SEGMENT_FACTS = 14;  // hard cap across the whole study (bounded context)

const pctNum = (p: number | null) => (p == null ? 0 : Math.round(p * 1000) / 10);
const ppDiff = (a: number, b: number) => Math.round((a - b) * 10) / 10;
const optLabel = (opts: OptionResult[], id: string) => opts.find((o) => String(o.optionId) === String(id))?.label ?? id;
const leaderOf = (opts: OptionResult[]): OptionResult | null =>
  opts.length ? opts.reduce((a, b) => ((b.percentage ?? 0) > (a.percentage ?? 0) ? b : a)) : null;
const joinNames = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function segRef(kind: string, scopeId: string, key: string, dim: SegmentDimension, extra = "", ns: "study" | "survey" = "study"): string {
  return `derived:${kind}:${ns}#${scopeId}|q#${key}|dim#${dim}${extra}`;
}

/**
 * Deterministic segment derived facts for the study. Bounded and safe: only groups with a
 * valid base compare; only material spreads/concentrations surface; per-question and study
 * caps prevent explosion. Every fact is descriptive and dimension-tagged.
 */
export function buildSegmentDerived(scopeId: string, questions: SegmentQuestion[], ns: "study" | "survey" = "study"): SegmentDerivedItem[] {
  const out: SegmentDerivedItem[] = [];
  for (const q of questions) {
    if (out.length >= MAX_SEGMENT_FACTS) break;
    const groups = q.groups.filter((g) => g.base >= MIN_SEGMENT_BASE && g.options.length > 0);
    if (groups.length < MIN_SEGMENTS) continue;
    const dim = q.dimension;
    const overallLeader = leaderOf(q.overall);
    const perGroupLeader = groups.map((g) => ({ g, leader: leaderOf(g.options) })).filter((x) => x.leader);
    const facts: SegmentDerivedItem[] = [];

    // 1. Reversal vs consistency of the leading option across groups.
    const leaderIds = new Set(perGroupLeader.map((x) => String(x.leader!.optionId)));
    if (leaderIds.size > 1 && overallLeader) {
      const dominant = String(overallLeader.optionId);
      const withDominant = perGroupLeader.filter((x) => String(x.leader!.optionId) === dominant).map((x) => x.g.label);
      const breakers = perGroupLeader.filter((x) => String(x.leader!.optionId) !== dominant);
      const breakerNote = breakers.map((x) => `"${optLabel(g0opts(x.g), String(x.leader!.optionId))}" among ${x.g.label} respondents`);
      facts.push({
        ref: segRef("seg-reversal", scopeId, q.canonicalQuestionKey, dim, "", ns),
        kind: "seg_reversal", canonicalQuestionKey: q.canonicalQuestionKey, question: q.question, dimension: dim,
        label: `The most-selected answer differs by ${dim}: "${optLabel(q.overall, dominant)}" leads among ${joinNames(withDominant)} respondents, but ${joinNames(breakerNote)}`,
        value: leaderIds.size, unit: "bool",
        inputRefs: [], detail: { dominantOption: optLabel(q.overall, dominant), groups: perGroupLeader.map((x) => ({ group: x.g.label, base: x.g.base, leads: optLabel(g0opts(x.g), String(x.leader!.optionId)) })) },
      });
    } else if (overallLeader && leaderIds.size === 1) {
      facts.push({
        ref: segRef("seg-consistency", scopeId, q.canonicalQuestionKey, dim, "", ns),
        kind: "seg_consistency", canonicalQuestionKey: q.canonicalQuestionKey, question: q.question, dimension: dim,
        label: `The most-selected answer ("${optLabel(q.overall, String(overallLeader.optionId))}") is consistent across all ${groups.length} ${dim}s (${joinNames(groups.map((g) => g.label))})`,
        value: 1, unit: "bool",
        inputRefs: [], detail: { option: optLabel(q.overall, String(overallLeader.optionId)), groups: groups.map((g) => ({ group: g.label, base: g.base })) },
      });
    }

    // 2. Largest cross-segment spreads per option (descriptive range in pp).
    const spreads: { oid: string; min: number; max: number; hi: string; lo: string; spread: number }[] = [];
    for (const o of q.overall) {
      const oid = String(o.optionId);
      const pts = groups.map((g) => ({ label: g.label, pct: pctNum(g.options.find((x) => String(x.optionId) === oid)?.percentage ?? null) }));
      if (pts.length < MIN_SEGMENTS) continue;
      const hi = pts.reduce((a, b) => (b.pct > a.pct ? b : a));
      const lo = pts.reduce((a, b) => (b.pct < a.pct ? b : a));
      const spread = ppDiff(hi.pct, lo.pct);
      if (spread >= SEG_SPREAD_MIN_PP) spreads.push({ oid, min: lo.pct, max: hi.pct, hi: hi.label, lo: lo.label, spread });
    }
    spreads.sort((a, b) => b.spread - a.spread);
    for (const s of spreads.slice(0, SEG_SPREADS_PER_Q)) {
      facts.push({
        ref: segRef("seg-spread", scopeId, q.canonicalQuestionKey, dim, `|opt#${s.oid}`, ns),
        kind: "seg_spread", canonicalQuestionKey: q.canonicalQuestionKey, question: q.question, dimension: dim,
        label: `"${optLabel(q.overall, s.oid)}" ranges ${s.min}%–${s.max}% across ${dim}s (spread ${s.spread}pp; highest among ${s.hi} respondents, lowest among ${s.lo} respondents)`,
        value: s.spread, unit: "pp",
        inputRefs: [], detail: { option: optLabel(q.overall, s.oid), min: s.min, max: s.max, highest: s.hi, lowest: s.lo },
      });
    }

    // 3. Single strongest concentration vs overall (a response disproportionately in one group).
    let best: { oid: string; group: string; g: number; overall: number; dev: number } | null = null;
    for (const o of q.overall) {
      const oid = String(o.optionId);
      const ov = pctNum(o.percentage);
      for (const g of groups) {
        const gp = pctNum(g.options.find((x) => String(x.optionId) === oid)?.percentage ?? null);
        const dev = Math.abs(ppDiff(gp, ov));
        if (dev >= SEG_CONC_MIN_PP && (!best || dev > best.dev)) best = { oid, group: g.label, g: gp, overall: ov, dev };
      }
    }
    if (best) {
      facts.push({
        ref: segRef("seg-conc", scopeId, q.canonicalQuestionKey, dim, `|opt#${best.oid}|grp#${best.group}`, ns),
        kind: "seg_concentration", canonicalQuestionKey: q.canonicalQuestionKey, question: q.question, dimension: dim,
        label: `"${optLabel(q.overall, best.oid)}" is chosen by ${best.g}% of ${best.group} respondents, compared with ${best.overall}% overall`,
        value: ppDiff(best.g, best.overall), unit: "pp",
        inputRefs: [], detail: { option: optLabel(q.overall, best.oid), group: best.group, groupPct: best.g, overallPct: best.overall },
      });
    }

    for (const f of facts) { if (out.length < MAX_SEGMENT_FACTS) out.push(f); }
  }
  return out;
}

// Helper: a group's options (kept tiny so the reversal block reads clearly).
function g0opts(g: SegmentGroupDist): OptionResult[] { return g.options; }
