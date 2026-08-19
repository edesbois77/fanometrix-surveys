// ── Benchmark Study 001 — FedEx UCL — SOURCE AGGREGATES (pure) ──
//
// The benchmark's own, self-contained copy of the three common-question
// aggregates, transcribed from the source of record:
//
//     FedEx-UCL-Study-Survey-Results.csv   (the exported human-review CSV)
//
// This module is INDEPENDENT of any production/Studio type on purpose, so the
// benchmark cannot be silently changed by production refactors. The numbers
// were verified, at benchmark-authoring time, to match the repository QA
// fixture lib/studio/qa/fedex-fixture.ts EXACTLY for all three common
// questions and the Survey-1/Survey-v2 wave split (a drift test asserts this;
// see benchmark.test.ts::"fixture cross-check").
//
// SCOPE OF THE SOURCE: three common questions, combined n=274 (Survey 1 n=196,
// Survey v2 n=78). The source CSV contains NO country/segment breakdown — the
// live fixture's per-country probe is a DIFFERENT source and is deliberately
// out of scope here (see benchmark.json::not_in_source and MUST NOT SAY #9).

import { createHash } from "node:crypto";

export type BenchOption = {
  id: string;
  label: string;
  combined: number;  // count across both surveys
  s1: number;        // Survey 1 count
  s2: number;        // Survey v2 count
};

export type BenchQuestion = {
  key: string;       // canonical question key
  label: string;
  base: number;      // combined answered base
  s1Base: number;
  s2Base: number;
  options: BenchOption[];
};

export type BenchSource = {
  study: string;
  combinedBase: number;
  s1Base: number;
  s2Base: number;
  questions: BenchQuestion[];
};

// Counts transcribed from the CSV (== fixture). Option ids are stable within a
// question and used by benchmark.json's EvidenceRefs.
export const FEDEX_SOURCE: BenchSource = {
  study: "FedEx UCL Sponsorship 26/27",
  combinedBase: 274,
  s1Base: 196,
  s2Base: 78,
  questions: [
    {
      key: "q_fit",
      label: "FedEx as a Champions League sponsor?",
      base: 274, s1Base: 196, s2Base: 78,
      options: [
        { id: "strong_fit",       label: "Strong natural fit",      combined: 92, s1: 62, s2: 30 },
        { id: "relevant_unclear", label: "Relevant but unclear",    combined: 85, s1: 58, s2: 27 },
        { id: "brand_visibility", label: "Mostly brand visibility", combined: 29, s1: 23, s2: 6 },
        { id: "never_noticed",    label: "Never noticed them",      combined: 68, s1: 53, s2: 15 },
      ],
    },
    {
      key: "q_offer",
      label: "What should sponsors offer fans?",
      base: 274, s1Base: 196, s2Base: 78,
      options: [
        { id: "rewards",     label: "Rewards and benefits",      combined: 100, s1: 66, s2: 34 },
        { id: "experiences", label: "Better fan experiences",    combined: 60,  s1: 41, s2: 19 },
        { id: "access",      label: "Exclusive access",          combined: 59,  s1: 41, s2: 18 },
        { id: "grassroots",  label: "Investment in grassroots",  combined: 55,  s1: 48, s2: 7 },
      ],
    },
    {
      key: "q_help",
      label: "How could FedEx help fans most?",
      base: 274, s1Base: 196, s2Base: 78,
      options: [
        { id: "experiences_access", label: "Access to experiences",       combined: 90, s1: 61, s2: 29 },
        { id: "connecting",         label: "Connecting football fans",    combined: 67, s1: 49, s2: 18 },
        { id: "communities",        label: "Supporting local communities", combined: 59, s1: 39, s2: 20 },
        { id: "content",            label: "Exclusive football content",  combined: 58, s1: 47, s2: 11 },
      ],
    },
  ],
};

/** Round to one decimal place — the display precision the human review used. */
export const round1 = (x: number): number => Math.round(x * 10) / 10;

export function question(key: string): BenchQuestion {
  const q = FEDEX_SOURCE.questions.find((q) => q.key === key);
  if (!q) throw new Error(`unknown question ${key}`);
  return q;
}

export function option(qKey: string, optId: string): BenchOption {
  const o = question(qKey).options.find((o) => o.id === optId);
  if (!o) throw new Error(`unknown option ${qKey}/${optId}`);
  return o;
}

/** Combined percentage of an option, 1 dp — the governed display figure. */
export function optionPct(qKey: string, optId: string): number {
  const q = question(qKey);
  return round1((option(qKey, optId).combined / q.base) * 100);
}

/** Per-wave percentage of an option, 1 dp. */
export function wavePct(qKey: string, optId: string, wave: "s1" | "s2"): number {
  const q = question(qKey);
  const o = option(qKey, optId);
  const base = wave === "s1" ? q.s1Base : q.s2Base;
  return round1((o[wave] / base) * 100);
}

/** The lead, in percentage points, of the top option over the next, computed
 *  as a difference of DISPLAYED (rounded) percentages — matching the human
 *  review (e.g. Q1 2.6pp, Q2 14.6pp, Q3 8.3pp). */
export function topLeadPp(qKey: string): { top: string; next: string; leadPp: number } {
  const pcts = question(qKey).options.map((o) => ({ id: o.id, pct: optionPct(qKey, o.id) })).sort((a, b) => b.pct - a.pct);
  return { top: pcts[0].id, next: pcts[1].id, leadPp: round1(pcts[0].pct - pcts[1].pct) };
}

/** Sum of several option percentages (as displayed), 1 dp. Used by the
 *  benchmark to declare allowed groupings (e.g. relevance 64.6) and to detect
 *  prohibited sums (e.g. 55.8, and any cross-question 69.3). */
export function groupPct(refs: { question: string; option: string }[]): number {
  return round1(refs.reduce((sum, r) => sum + optionPct(r.question, r.option), 0));
}

/** The full set of DISPLAYED numbers the source legitimately supports:
 *  every option percentage, every per-wave percentage, the base sizes, and the
 *  top-lead gaps. Grounding checks test stated numbers against this set (plus
 *  any allowed groupings declared in the benchmark). */
export function governedNumbers(): number[] {
  const nums = new Set<number>();
  nums.add(FEDEX_SOURCE.combinedBase);
  nums.add(FEDEX_SOURCE.s1Base);
  nums.add(FEDEX_SOURCE.s2Base);
  for (const q of FEDEX_SOURCE.questions) {
    for (const o of q.options) {
      nums.add(optionPct(q.key, o.id));
      const s1 = wavePct(q.key, o.id, "s1");
      const s2 = wavePct(q.key, o.id, "s2");
      nums.add(s1);
      nums.add(s2);
      // per-option Survey-1 vs Survey-v2 difference (a legitimate source figure,
      // e.g. the 15.5pp grassroots gap the human review accepts as a MAY-FIND).
      nums.add(round1(Math.abs(s1 - s2)));
    }
    nums.add(topLeadPp(q.key).leadPp);
  }
  return [...nums].sort((a, b) => a - b);
}

/** A stable content hash of the source aggregates — used as the benchmark's
 *  `source_hash` so any change to the underlying numbers is detectable. */
export function sourceHash(): string {
  const canonical = JSON.stringify(FEDEX_SOURCE, Object.keys(FEDEX_SOURCE).sort());
  // Canonicalise deeply and deterministically:
  const stable = stableStringify(FEDEX_SOURCE);
  void canonical;
  return "sha256:" + createHash("sha256").update(stable).digest("hex").slice(0, 32);
}

function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v as Record<string, unknown>).sort().map((k) => JSON.stringify(k) + ":" + stableStringify((v as Record<string, unknown>)[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}
