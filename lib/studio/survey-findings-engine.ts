// ── Survey Studio → Discover → Survey → Findings (pure, deterministic) ───────
// "What does this research tell me?" — a small RANKED set of evidence-backed
// findings computed from the SAME governed per-question distributions Results
// shows, plus base-gated segment facts (reusing buildSegmentDerived). NO AI, NO
// persistence, NO respondent-level cross-tabs. Every finding re-derives from its
// evidence and carries a transparent base.
//
// Honesty rules that this engine enforces:
//   • A minimum answered base gates every finding (fail closed below it).
//   • Segment findings reuse buildSegmentDerived's base gate (≥30 per group, ≥2
//     groups) — a "difference" is never invented from tiny bases.
//   • NEVER a respondent-level / correlational claim ("people who answered X to Q1
//     were more likely to answer Y to Q2"). Aggregate multi-question observations
//     are descriptive only — two facts side by side, never one shared population.
//     assertNoCorrelationClaim() is the machine check; the tests assert it.
//   • It does NOT emit one finding per question; it selects the genuinely useful
//     observations, caps repetitive "dominant" cards, and prefers novel signals.

import { buildSegmentDerived, type SegmentQuestion, type SegmentDerivedItem } from "./study-segments";
import type { OptionResult } from "./survey-results";

/** Minimum answered base before ANY finding may be surfaced (fail closed). */
export const FINDING_MIN_BASE = 30;

// Tunable, named thresholds (all deterministic).
const STRONG_MAJORITY_PCT = 50;   // a single option ≥ this = a clear majority view
const CLEAR_LEAD_PP = 20;         // leader ahead of runner-up by ≥ this = dominant
const DIVIDED_TOP_MAX_PCT = 40;   // no option reaches this AND …
const DIVIDED_GAP_MAX_PP = 8;     // … top two within this = a divided/no-consensus result
const MINORITY_MIN_PCT = 25;      // a non-leading option ≥ this = a notable minority
const LOW_CONFIDENCE_BASE = 100;  // below this, findings are flagged low-confidence
const MAX_FINDINGS = 8;           // one per question (≤5) + a few cross-question extras
const MAX_MINORITY_CARDS = 2;     // notable minorities enrich, but don't flood the page

export type SurveyFindingType = "dominant" | "leading" | "divided" | "minority" | "pattern" | "market" | "device" | "completion";

// A per-question "primary" finding (its single headline read); every question with a
// sufficient base gets exactly one, so the baseline is never thinner than the survey.
const QUESTION_PRIMARY_TYPES = new Set<SurveyFindingType>(["dominant", "leading", "divided"]);

/** Emerging vs Final context — derived from the effective survey lifecycle, NOT a
 *  second status system. "none" = below the evidence threshold. */
export type SurveyFindingsContext = "emerging" | "final" | "none";

export type SurveyFinding = {
  id: string;
  type: SurveyFindingType;
  /** Light display chip, e.g. "Dominant attitude". */
  tag: string;
  /** The headline claim. */
  title: string;
  /** Optional secondary line with the specifics. */
  detail?: string;
  /** Question text(s) this finding rests on (1–2). */
  supportingQuestions: string[];
  /** Answered base behind the finding. */
  base: number;
  /** Transparent numbers for the evidence line. */
  metrics: {
    option?: string;
    pct?: number;
    runnerUp?: { option: string; pct: number };
    segment?: { dimension: string; text: string };
  };
  confidence: "ok" | "low";
  emphasis: "primary" | "supporting";
};

export type SurveyQuestionEvidence = {
  index: number;
  questionId: string;
  text: string;
  base: number;
  /** respondents who reached the question (studio-native only); null = unavailable. */
  shown: number | null;
  options: OptionResult[];
};

export type SurveySegmentEvidence = {
  dimension: "market" | "device";
  questions: SegmentQuestion[];
};

export type SurveyFindingsInput = {
  surveyName: string;
  mode: "studio_native" | "historical_completed_only";
  questions: SurveyQuestionEvidence[];
  segments?: SurveySegmentEvidence[];
};

// ── Correlation guardrail (the research-integrity firewall) ──────────────────
// Any finding text that would imply respondent-level co-occurrence is forbidden.
export const CORRELATION_BANNED: RegExp[] = [
  /\bmore likely\b/i,
  /\bwho answered\b/i,
  /\bthose who\b/i,
  /\bthe same (respondents|people|fans)\b/i,
  /\bcorrelat/i,
  /\brespondents (positive|who)\b/i,
  /\balso (chose|answered|said|selected)\b/i,
];
export function assertNoCorrelationClaim(text: string): void {
  for (const re of CORRELATION_BANNED) {
    if (re.test(text)) throw new Error(`Correlation claim leaked into a finding: "${text}"`);
  }
}

const pct = (o: OptionResult): number => Math.round((o.percentage ?? 0) * 100);
const shortQ = (t: string): string => (t.length > 60 ? `${t.slice(0, 57)}…` : t);
const confidenceOf = (base: number): "ok" | "low" => (base >= LOW_CONFIDENCE_BASE ? "ok" : "low");
const ranked = (opts: OptionResult[]): OptionResult[] => [...opts].sort((a, b) => (b.count - a.count));

// ── Per-question findings (dominant / divided / minority) ─────────────────────
function questionFindings(q: SurveyQuestionEvidence): SurveyFinding[] {
  if (q.base < FINDING_MIN_BASE || q.options.length === 0) return [];
  const order = ranked(q.options);
  const top = order[0];
  const second = order[1];
  const topPct = pct(top);
  const secondPct = second ? pct(second) : 0;
  const gap = topPct - secondPct;
  const out: SurveyFinding[] = [];
  const conf = confidenceOf(q.base);

  if (topPct >= STRONG_MAJORITY_PCT || gap >= CLEAR_LEAD_PP) {
    // Dominant attitude.
    out.push({
      id: `dom-${q.index}`, type: "dominant", tag: "Dominant attitude",
      title: topPct >= STRONG_MAJORITY_PCT
        ? `A clear majority chose "${top.label}" (${topPct}%)`
        : `"${top.label}" leads clearly (${topPct}%)`,
      detail: second ? `Ahead of "${second.label}" at ${secondPct}%.` : undefined,
      supportingQuestions: [q.text], base: q.base,
      metrics: { option: top.label, pct: topPct, runnerUp: second ? { option: second.label, pct: secondPct } : undefined },
      confidence: conf, emphasis: "supporting",
    });
    // A notable minority worth flagging alongside a clear leader.
    const minority = order.slice(1).find((o) => pct(o) >= MINORITY_MIN_PCT);
    if (minority) {
      out.push({
        id: `min-${q.index}`, type: "minority", tag: "Notable minority",
        title: `A notable minority (${pct(minority)}%) chose "${minority.label}"`,
        detail: `On "${shortQ(q.text)}".`,
        supportingQuestions: [q.text], base: q.base,
        metrics: { option: minority.label, pct: pct(minority) },
        confidence: conf, emphasis: "supporting",
      });
    }
  } else if (topPct < DIVIDED_TOP_MAX_PCT && gap <= DIVIDED_GAP_MAX_PP && second) {
    // Divided / no consensus.
    out.push({
      id: `div-${q.index}`, type: "divided", tag: "Divided response",
      title: `Opinion is split — no single answer dominates`,
      detail: `"${top.label}" (${topPct}%) and "${second.label}" (${secondPct}%) are closely matched.`,
      supportingQuestions: [q.text], base: q.base,
      metrics: { option: top.label, pct: topPct, runnerUp: { option: second.label, pct: secondPct } },
      confidence: conf, emphasis: "supporting",
    });
  } else if (second) {
    // Leading response — a genuine front-runner that is neither an outright majority
    // nor a dead heat (e.g. 44% vs 35%). Purely factual; fills the coverage gap so a
    // substantial question is never silently dropped. Base-gated like the others.
    out.push({
      id: `lead-${q.index}`, type: "leading", tag: "Leading response",
      title: `"${top.label}" was the most-selected answer (${topPct}%)`,
      detail: `Ahead of "${second.label}" at ${secondPct}%.`,
      supportingQuestions: [q.text], base: q.base,
      metrics: { option: top.label, pct: topPct, runnerUp: { option: second.label, pct: secondPct } },
      confidence: conf, emphasis: "supporting",
    });
  }
  return out;
}

// ── Aggregate multi-question pattern (descriptive, NEVER correlational) ───────
function patternFinding(qs: SurveyQuestionEvidence[]): SurveyFinding | null {
  const dominant = qs
    .filter((q) => q.base >= FINDING_MIN_BASE && q.options.length > 0)
    .map((q) => ({ q, order: ranked(q.options) }))
    .filter(({ order }) => pct(order[0]) >= STRONG_MAJORITY_PCT || (pct(order[0]) - (order[1] ? pct(order[1]) : 0)) >= CLEAR_LEAD_PP);
  if (dominant.length < 2) return null;
  const picks = dominant.slice(0, 2);
  // Two facts side by side — describes each question independently, asserts NOTHING
  // about the same respondents holding both views.
  const detail = picks.map(({ q, order }) => `"${order[0].label}" on "${shortQ(q.text)}"`).join("; ");
  const f: SurveyFinding = {
    id: "pattern-decisive", type: "pattern", tag: "Across the survey",
    title: `Respondents gave decisive answers on ${dominant.length} of ${qs.length} questions`,
    detail: `A clear leader emerged: ${detail}.`,
    supportingQuestions: picks.map(({ q }) => q.text),
    base: Math.min(...picks.map(({ q }) => q.base)),
    metrics: {}, confidence: "ok", emphasis: "supporting",
  };
  return f;
}

// ── Completion / drop-off (studio-native only; needs `shown`) ────────────────
function completionFinding(qs: SurveyQuestionEvidence[]): SurveyFinding | null {
  const withShown = qs.filter((q) => q.shown != null && q.shown >= FINDING_MIN_BASE);
  if (withShown.length < 2) return null;
  // The steepest per-question completion (answered ÷ shown) below a clear threshold.
  let worst: { q: SurveyQuestionEvidence; rate: number } | null = null;
  for (const q of withShown) {
    const rate = q.shown && q.shown > 0 ? q.base / q.shown : 1;
    if (rate < 0.75 && (!worst || rate < worst.rate)) worst = { q, rate };
  }
  if (!worst) return null;
  return {
    id: `comp-${worst.q.index}`, type: "completion", tag: "Completion pattern",
    title: `Engagement dips at "${shortQ(worst.q.text)}"`,
    detail: `Answered by ${Math.round(worst.rate * 100)}% of respondents reaching this question.`,
    supportingQuestions: [worst.q.text], base: worst.q.shown ?? worst.q.base,
    metrics: { pct: Math.round(worst.rate * 100) },
    confidence: confidenceOf(worst.q.shown ?? 0), emphasis: "supporting",
  };
}

// ── Segment findings (market / device) — reuse buildSegmentDerived's base gate ─
function segmentFindings(seg: SurveySegmentEvidence): SurveyFinding[] {
  // buildSegmentDerived owns the safety: ≥30 per group, ≥2 groups, material spreads
  // only. We take at most ONE (the strongest) per dimension and give it clean,
  // survey-appropriate wording built from the item's structured detail.
  const items = buildSegmentDerived(seg.dimension, seg.questions.map((q) => ({ ...q, dimension: seg.dimension })));
  if (items.length === 0) return [];
  const strongest = pickStrongestSegmentItem(items);
  if (!strongest) return [];
  const dimLabel = seg.dimension === "market" ? "market" : "device";
  const q = seg.questions.find((x) => x.canonicalQuestionKey === strongest.canonicalQuestionKey);
  const base = q?.overallBase ?? 0;
  const f = segmentItemToFinding(strongest, dimLabel, base);
  return f ? [f] : [];
}

function pickStrongestSegmentItem(items: SegmentDerivedItem[]): SegmentDerivedItem | null {
  // Reversal is the most notable; otherwise the largest pp spread/concentration.
  const reversal = items.find((i) => i.kind === "seg_reversal");
  if (reversal) return reversal;
  const numeric = items.filter((i) => i.unit === "pp").sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  return numeric[0] ?? items[0] ?? null;
}

function segmentItemToFinding(item: SegmentDerivedItem, dimLabel: string, base: number): SurveyFinding | null {
  const d = item.detail as Record<string, unknown>;
  const type: SurveyFindingType = dimLabel === "market" ? "market" : "device";
  const tag = dimLabel === "market" ? "Market difference" : "Device difference";
  let title = "";
  let detail = "";
  if (item.kind === "seg_reversal") {
    title = `Views on "${shortQ(item.question)}" differ by ${dimLabel}`;
    detail = String(item.label);
  } else if (item.kind === "seg_spread") {
    const opt = String(d.option ?? "");
    title = `"${opt}" varies by ${dimLabel}`;
    detail = `${d.min}%–${d.max}% (highest among ${d.highest}, lowest among ${d.lowest}).`;
  } else if (item.kind === "seg_concentration") {
    const opt = String(d.option ?? "");
    title = `"${opt}" is stronger in one ${dimLabel}`;
    detail = `${d.groupPct}% of ${d.group} vs ${d.overallPct}% overall.`;
  } else {
    return null; // consistency is not a "difference" — don't surface as one
  }
  return {
    id: `seg-${dimLabel}-${item.canonicalQuestionKey}`, type, tag, title, detail,
    supportingQuestions: [item.question], base,
    metrics: { segment: { dimension: dimLabel, text: String(item.label) } },
    confidence: confidenceOf(base), emphasis: "supporting",
  };
}

// ── Selection + ranking ───────────────────────────────────────────────────────
const SCORE: Record<SurveyFindingType, number> = {
  market: 90, device: 88, divided: 80, minority: 62, pattern: 56, completion: 52, leading: 34, dominant: 30,
};
function scoreOf(f: SurveyFinding): number {
  const base = SCORE[f.type];
  // A stronger leader ranks a little higher within its type (but always below novel types).
  return f.type === "dominant" || f.type === "leading" ? base + Math.min(19, (f.metrics.pct ?? 0) * 0.2) : base;
}

export function buildSurveyFindings(input: SurveyFindingsInput): SurveyFinding[] {
  const candidates: SurveyFinding[] = [];
  for (const q of input.questions) candidates.push(...questionFindings(q));
  const pattern = patternFinding(input.questions);
  if (pattern) candidates.push(pattern);
  const completion = completionFinding(input.questions);
  if (completion) candidates.push(completion);
  for (const seg of input.segments ?? []) candidates.push(...segmentFindings(seg));

  // Machine guardrail: no candidate may imply respondent-level correlation.
  for (const f of candidates) { assertNoCorrelationClaim(f.title); if (f.detail) assertNoCorrelationClaim(f.detail); }

  // Coverage first: KEEP every question's single primary finding (dominant/leading/
  // divided) so the baseline is never thinner than the survey — a substantial
  // question is never silently dropped. Then add the cross-question EXTRAS (notable
  // minority, pattern, market/device difference, completion) by insight value, up
  // to the total cap. No manufactured cards; every one is base-gated evidence.
  const primaries = candidates.filter((f) => QUESTION_PRIMARY_TYPES.has(f.type)).sort((a, b) => scoreOf(b) - scoreOf(a));
  const extras = candidates.filter((f) => !QUESTION_PRIMARY_TYPES.has(f.type)).sort((a, b) => scoreOf(b) - scoreOf(a));
  const chosen: SurveyFinding[] = [...primaries];
  let minorityCount = 0;
  for (const e of extras) {
    if (chosen.length >= MAX_FINDINGS) break;
    if (e.type === "minority") { if (minorityCount >= MAX_MINORITY_CARDS) continue; minorityCount++; }
    chosen.push(e);
  }
  // Display order: most insightful first (segment/divided lead; per-question leaders follow).
  chosen.sort((a, b) => scoreOf(b) - scoreOf(a));
  const capped = chosen.slice(0, MAX_FINDINGS);
  if (capped[0]) capped[0].emphasis = "primary";
  return capped;
}

/** Emerging / Final / none from the effective lifecycle + evidence. Pure. */
export function findingsContext(input: { hasLiveCampaign: boolean; totalAnswered: number }): SurveyFindingsContext {
  if (input.totalAnswered < FINDING_MIN_BASE) return "none";
  return input.hasLiveCampaign ? "emerging" : "final";
}
