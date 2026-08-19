// ── Fanometrix Intelligence Evals — SCORING (pure, dependency-free) ──
//
// Honest, tiered scoring of an AnalysisUnderTest against a Benchmark. No
// OpenAI, no Studio, no DB — everything here is deterministic and CI-safe.
//
// DESIGN PRINCIPLE (from the task): "We would rather have a small honest
// evaluation harness than a sophisticated-looking one that produces
// meaningless scores." So each dimension declares its scoreability TIER and,
// when it cannot be safely decided by code today, returns status
// "unscoreable" WITH A REASON rather than a fabricated number.
//
//   TIER 1 deterministic        — arithmetic validity, number grounding,
//                                 prohibited-sum detection, selectivity counts.
//   TIER 2 structured-output    — must-find recall & ranking, but ONLY when the
//                                 producer self-tags findings (claimsMustFindId).
//   TIER 2h deterministic-heuristic (precision aid) — lexical MUST-NOT-SAY flags
//                                 (overstated lead, trend, causal). These FLAG
//                                 for review; a clean pass is NOT a proof of
//                                 absence (paraphrases evade them).
//   TIER 3 model-assisted       — semantic must-find recall, acceptable-
//                                 interpretation match, synthesis-vs-arithmetic
//                                 judgement. Returned as unscoreable here.
//   TIER 4 human                — "did it tell the real story?", explanatory
//                                 value. Returned as unscoreable here.

import type { Benchmark, Grouping, ScoreabilityTier } from "./schema";
import type { AnalysisUnderTest, AnalysisFinding } from "./capture-contract";

/** Source facts the scorer needs, kept source-agnostic so scoring.ts never
 *  imports a specific benchmark's source module. A benchmark supplies these
 *  via its own source helpers (see fedex-ucl-001/source.ts). */
export type SourceModel = {
  /** Every displayed number the source legitimately supports (option %s,
   *  per-wave %s, base sizes, lead gaps). */
  governedNumbers: number[];
  /** Every option's displayed combined percentage, for cross-question-sum
   *  detection. */
  options: { question: string; option: string; pct: number }[];
};

export type DimensionStatus = "scored" | "flags-only" | "unscoreable";

export type DimensionResult = {
  dimension: string;
  tier: ScoreabilityTier | "deterministic-heuristic";
  status: DimensionStatus;
  /** 0..1 when meaningfully scored; omitted for flags-only/unscoreable. */
  score?: number;
  detail: Record<string, unknown>;
  notes: string[];
};

export type BenchmarkScore = {
  benchmarkId: string;
  producedBy: string;
  dimensions: DimensionResult[];
  /** Hard-fail signals a gate can act on without any semantic judgement. */
  gate: {
    arithmeticViolations: number;   // stated numbers that are prohibited sums
    ungroundedNumbers: number;      // stated numbers not supported by the source
    overBudget: boolean;            // more headline findings than allowed
  };
};

const TOL = 0.05; // displayed numbers are 1 dp; allow float slack
const approxEq = (a: number, b: number): boolean => Math.abs(a - b) <= TOL;
const approxIn = (n: number, set: number[]): boolean => set.some((v) => approxEq(v, n));

// ── Arithmetic explanation ────────────────────────────────────────────────────
export type SumExplanation = {
  value: number;
  terms: { question: string; option: string; pct: number }[];
  questionSpan: number;
};

/** Try to explain a number as a sum of 2..maxTerms option percentages. Returns
 *  the first subset found (smallest size first), or null. Deterministic. */
export function explainAsSum(
  n: number,
  options: SourceModel["options"],
  maxTerms = 3
): SumExplanation | null {
  const idx = options.map((o, i) => i);
  for (let size = 2; size <= Math.min(maxTerms, options.length); size++) {
    const combo = combinations(idx, size);
    for (const c of combo) {
      const terms = c.map((i) => options[i]);
      const sum = round1(terms.reduce((s, t) => s + t.pct, 0));
      if (approxEq(sum, n)) {
        return { value: n, terms, questionSpan: new Set(terms.map((t) => t.question)).size };
      }
    }
  }
  return null;
}

const round1 = (x: number): number => Math.round(x * 10) / 10;

function combinations<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (acc.length === k) { out.push([...acc]); return; }
    for (let i = start; i < arr.length; i++) { acc.push(arr[i]); rec(i + 1, acc); acc.pop(); }
  };
  rec(0, []);
  return out;
}

// ── Prohibited-arithmetic detector (TIER 1) ──────────────────────────────────
export type ArithmeticViolation = {
  value: number;
  kind: "declared_forbidden_grouping" | "cross_question_sum";
  terms?: { question: string; option: string; pct: number }[];
  reason: string;
};

export type SuspectGrouping = {
  value: number;
  terms: { question: string; option: string; pct: number }[];
  reason: string; // same-question sum not on the allowed list — needs semantic review
};

/** Classify a single stated number against the source + benchmark groupings.
 *  This is the crown-jewel deterministic check: it decides GROUNDED /
 *  ALLOWED-GROUPING / FORBIDDEN / CROSS-QUESTION-SUM / SUSPECT / UNGROUNDED
 *  purely from arithmetic and the benchmark's declared groupings. */
export function classifyNumber(
  n: number,
  source: SourceModel,
  benchmark: Pick<Benchmark, "allowed_groupings" | "forbidden_groupings">
): {
  kind: "grounded" | "allowed_grouping" | "forbidden_grouping" | "cross_question_sum" | "suspect_grouping" | "ungrounded";
  explanation?: SumExplanation;
  grouping?: Grouping;
} {
  if (approxIn(n, source.governedNumbers)) return { kind: "grounded" };

  const allowed = benchmark.allowed_groupings.find((g) => approxEq(g.value, n));
  if (allowed) return { kind: "allowed_grouping", grouping: allowed };

  const forbidden = benchmark.forbidden_groupings.find((g) => approxEq(g.value, n));
  if (forbidden) return { kind: "forbidden_grouping", grouping: forbidden };

  const sum = explainAsSum(n, source.options);
  if (sum) {
    if (sum.questionSpan > 1) return { kind: "cross_question_sum", explanation: sum };
    return { kind: "suspect_grouping", explanation: sum };
  }
  return { kind: "ungrounded" };
}

/** Whole-analysis arithmetic + grounding pass. */
export function scoreArithmeticAndGrounding(
  analysis: AnalysisUnderTest,
  benchmark: Benchmark,
  source: SourceModel
): { arithmetic: DimensionResult; grounding: DimensionResult } {
  const violations: (ArithmeticViolation & { findingId: string })[] = [];
  const suspects: (SuspectGrouping & { findingId: string })[] = [];
  const ungrounded: { findingId: string; value: number }[] = [];
  let total = 0, grounded = 0;

  const texts: { id: string; numbers: number[] }[] = [
    ...analysis.findings.map((f) => ({ id: f.id, numbers: f.statedNumbers ?? [] })),
    ...(analysis.narrative ? [{ id: "narrative", numbers: numbersIn(`${analysis.narrative.headline ?? ""} ${analysis.narrative.summary ?? ""}`) }] : []),
  ];

  for (const t of texts) {
    for (const n of t.numbers) {
      total++;
      const c = classifyNumber(n, source, benchmark);
      if (c.kind === "grounded" || c.kind === "allowed_grouping") { grounded++; continue; }
      if (c.kind === "forbidden_grouping") {
        violations.push({ findingId: t.id, value: n, kind: "declared_forbidden_grouping", reason: c.grouping?.reason ?? "matches a declared forbidden grouping" });
      } else if (c.kind === "cross_question_sum") {
        violations.push({ findingId: t.id, value: n, kind: "cross_question_sum", terms: c.explanation?.terms, reason: "sums percentages from more than one question (Principle 3 / P8)" });
      } else if (c.kind === "suspect_grouping") {
        suspects.push({ findingId: t.id, value: n, terms: c.explanation!.terms, reason: "same-question sum not on the allowed-grouping list — legitimate only if the components share the grouped meaning (needs semantic review)" });
      } else {
        ungrounded.push({ findingId: t.id, value: n });
      }
    }
  }

  const arithmetic: DimensionResult = {
    dimension: "arithmetic_validity",
    tier: "deterministic",
    status: "scored",
    score: total === 0 ? 1 : 1 - violations.length / total,
    detail: { total, violations, suspects },
    notes: [
      "Violations are prohibited sums (declared forbidden groupings or any cross-question sum).",
      "Suspects are same-question sums not on the allowed list — flagged, not failed (Principle 2/3).",
    ],
  };
  const grounding: DimensionResult = {
    dimension: "evidence_grounding_numeric",
    tier: "deterministic",
    status: "scored",
    score: total === 0 ? 1 : grounded / total,
    detail: { total, grounded, ungrounded },
    notes: ["Numeric grounding only: every stated % must be a governed source figure or a declared allowed grouping. Semantic grounding of the CLAIM is model-assisted (see report)."],
  };
  return { arithmetic, grounding };
}

// ── Selectivity (TIER 1) ─────────────────────────────────────────────────────
export function scoreSelectivity(analysis: AnalysisUnderTest, benchmark: Benchmark): DimensionResult {
  const count = analysis.findings.length;
  const max = benchmark.selectivity.max_headline_findings;
  return {
    dimension: "selectivity",
    tier: "deterministic",
    status: "scored",
    score: count <= max ? 1 : Math.max(0, max / count),
    detail: { count, max, overBudget: count > max },
    notes: [benchmark.selectivity.note, "The system is not rewarded for producing more findings (Principle 10)."],
  };
}

// ── Country / not-in-source guard (TIER 1) ───────────────────────────────────
export function scoreNotInSource(analysis: AnalysisUnderTest, benchmark: Benchmark): DimensionResult {
  const dims = benchmark.not_in_source.map((d) => d.toLowerCase());
  // A conservative lexicon per known not-in-source dimension.
  const COUNTRY = /\b(france|french|germany|german|spain|spanish|italy|italian|the uk|u\.k\.|\buk\b|britain|british|england)\b/i;
  const hits: { findingId: string; term: string }[] = [];
  const wantsCountry = dims.some((d) => d.includes("country") || d.includes("market") || d.includes("segment"));
  if (wantsCountry) {
    for (const f of analysis.findings) {
      const m = `${f.text} ${f.detail ?? ""}`.match(COUNTRY);
      if (m) hits.push({ findingId: f.id, term: m[0] });
    }
  }
  return {
    dimension: "not_in_source_claims",
    tier: "deterministic",
    status: hits.length ? "flags-only" : "scored",
    score: hits.length ? undefined : 1,
    detail: { not_in_source: benchmark.not_in_source, hits },
    notes: [
      "Claims resting on a not-in-source dimension are NOT ASSESSABLE from this benchmark's source: neither scored as supported nor auto-failed (MUST NOT SAY #9).",
      "To assess such claims, incorporate the relevant governed source data into the benchmark first.",
    ],
  };
}

// ── Lexical MUST-NOT-SAY flags (TIER 2h, precision aid) ───────────────────────
export function scoreLexicalMustNotSay(analysis: AnalysisUnderTest, benchmark: Benchmark, source: SourceModel): DimensionResult {
  const OVERSTATED = /\b(dominant|dominates?|clear winner|overwhelming(ly)?|vast majority|strong preference|decisive)\b/i;
  const TREND = /\b(declin\w+|collaps\w+|shrink\w+|dwindl\w+|grow\w+|ris\w+|fall\w+|surg\w+|trend\w*|over time|year[- ]on[- ]year|increasingly|decreasing)\b/i;
  const CAUSAL = /\b(will|would)\s+(improve|increase|boost|strengthen|enhance|drive|lift|raise)\b|\bbecause\b|\b(causes?|caused by|leads? to|results? in|driv(e|es|ing)|so that .* improves?)\b/i;

  // Which questions have a genuinely small lead (overstating "dominant" here is wrong)?
  const smallLeadQs = new Set<string>();
  const byQ = groupBy(source.options, (o) => o.question);
  for (const [q, opts] of byQ) {
    const sorted = [...opts].sort((a, b) => b.pct - a.pct);
    if (sorted.length >= 2 && round1(sorted[0].pct - sorted[1].pct) < 10) smallLeadQs.add(q);
  }

  const flags: { findingId: string; failure_type: string; snippet: string }[] = [];
  for (const f of analysis.findings) {
    const text = `${f.text} ${f.detail ?? ""}`;
    if (OVERSTATED.test(text) && (f.citedQuestions ?? []).some((q) => smallLeadQs.has(q))) {
      flags.push({ findingId: f.id, failure_type: "overstated_lead", snippet: (text.match(OVERSTATED) ?? [""])[0] });
    }
    if (TREND.test(text) && crossesWaves(f)) {
      flags.push({ findingId: f.id, failure_type: "unsupported_trend", snippet: (text.match(TREND) ?? [""])[0] });
    }
    if (CAUSAL.test(text)) {
      flags.push({ findingId: f.id, failure_type: "unsupported_causation", snippet: (text.match(CAUSAL) ?? [""])[0] });
    }
  }
  void benchmark;
  return {
    dimension: "lexical_must_not_say",
    tier: "deterministic-heuristic",
    status: "flags-only",
    detail: { flags },
    notes: [
      "PRECISION AID ONLY. These high-precision patterns FLAG likely violations (overstated lead on a <10pp gap; trend language on wave differences; causal 'will improve' language).",
      "A clean pass is NOT proof of absence — paraphrases evade lexical checks. Definitive MUST-NOT-SAY judgement for paraphrased claims is model-assisted/human.",
    ],
  };
}

function crossesWaves(f: AnalysisFinding): boolean {
  return /\bsurvey\s*(1|one|v?2|two)\b|\bwave\b|\bversion\b/i.test(`${f.text} ${f.detail ?? ""}`);
}

// ── Recall & ranking (TIER 2, requires self-tags) ────────────────────────────
export function scoreMustFindRecall(analysis: AnalysisUnderTest, benchmark: Benchmark): DimensionResult {
  const tagged = analysis.findings.filter((f) => f.claimsMustFindId);
  const mfIds = new Set(benchmark.must_find.map((m) => m.id));
  const validTags = new Set(tagged.map((f) => f.claimsMustFindId!).filter((id) => mfIds.has(id)));
  if (tagged.length === 0) {
    return {
      dimension: "must_find_recall",
      tier: "model-assisted",
      status: "unscoreable",
      detail: { total_must_find: mfIds.size, tagged: 0 },
      notes: [
        "The producer did not self-tag findings to must_find ids, so recall cannot be decided deterministically.",
        "Semantic recall (did the analysis EXPRESS each must-find concept, in any words?) requires the model-assisted judge (see ./model-judge.ts) or human review.",
      ],
    };
  }
  return {
    dimension: "must_find_recall",
    tier: "structured-output",
    status: "scored",
    score: validTags.size / mfIds.size,
    detail: { total_must_find: mfIds.size, found: [...validTags], missing: [...mfIds].filter((id) => !validTags.has(id)) },
    notes: [
      "Scored from producer self-tags (claimsMustFindId). A self-tag routes the check; it cannot make a wrong claim pass — arithmetic/grounding are scored independently.",
      "Untagged concepts still require the model-assisted judge to confirm they were not expressed under a different label.",
    ],
  };
}

export function scoreRanking(analysis: AnalysisUnderTest, benchmark: Benchmark): DimensionResult {
  const tagged = analysis.findings
    .filter((f) => f.claimsMustFindId && benchmark.must_find.some((m) => m.id === f.claimsMustFindId))
    .sort((a, b) => a.rank - b.rank)
    .map((f) => f.claimsMustFindId!);
  const uniqueInOrder = [...new Set(tagged)];
  if (uniqueInOrder.length < 2) {
    return {
      dimension: "ranking_quality",
      tier: "structured-output",
      status: "unscoreable",
      detail: { tagged: uniqueInOrder },
      notes: ["Need >= 2 self-tagged must-finds to assess ordering. Otherwise ranking is model-assisted/human."],
    };
  }
  const expected = benchmark.expected_hierarchy.filter((id) => uniqueInOrder.includes(id));
  // Normalised displacement: mean |actualPos - expectedPos| / worstCase.
  const actualPos = new Map(uniqueInOrder.map((id, i) => [id, i]));
  let disp = 0;
  expected.forEach((id, i) => { disp += Math.abs((actualPos.get(id) ?? 0) - i); });
  const worst = maxDisplacement(expected.length);
  const score = worst === 0 ? 1 : 1 - disp / worst;
  return {
    dimension: "ranking_quality",
    tier: "structured-output",
    status: "scored",
    score: Math.max(0, Math.min(1, score)),
    detail: { expected_order: expected, actual_order: uniqueInOrder, displacement: disp },
    notes: ["Ranking agreement of self-tagged must-finds vs expected_hierarchy (1 = perfect order). Whether an UNTAGGED finding out-prioritises a must-find is model-assisted."],
  };
}

function maxDisplacement(n: number): number {
  // Sum of |i - (n-1-i)| over i — the reversal, the worst case for this metric.
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(i - (n - 1 - i));
  return s;
}

// ── Dimensions that are honestly NOT deterministically scoreable yet ──────────
export function unscoreableDimensions(): DimensionResult[] {
  return [
    {
      dimension: "must_find_recall_semantic",
      tier: "model-assisted",
      status: "unscoreable",
      detail: {},
      notes: ["Did the analysis express each must-find CONCEPT in any wording? Requires a semantic judge; kept out of CI. See ./model-judge.ts (manual)."],
    },
    {
      dimension: "acceptable_interpretation_match",
      tier: "model-assisted",
      status: "unscoreable",
      detail: {},
      notes: ["Is the interpretation within the acceptable set and clear of forbidden_extensions? Paraphrase-tolerant; needs a model judge or human."],
    },
    {
      dimension: "cross_question_synthesis_quality",
      tier: "model-assisted",
      status: "unscoreable",
      detail: {},
      notes: [
        "Deterministic code can confirm NO prohibited cross-question SUM occurred (see arithmetic_validity) and can list findings citing >1 question WITHOUT a summed number (candidate legitimate synthesis).",
        "Whether such a synthesis is CORRECT and valuable is semantic — model-assisted/human.",
      ],
    },
    {
      dimension: "tells_the_real_story",
      tier: "human",
      status: "unscoreable",
      detail: {},
      notes: ["Overall explanatory value / did it capture the important story with the smallest sufficient set. Human judgement for now (Principle 10)."],
    },
  ];
}

// ── Candidate synthesis lister (TIER 1 support for the semantic dimension) ────
export function listCrossQuestionFindings(analysis: AnalysisUnderTest, benchmark: Benchmark, source: SourceModel): {
  withProhibitedSum: string[];
  candidateSynthesis: string[];
} {
  const withProhibitedSum: string[] = [];
  const candidateSynthesis: string[] = [];
  for (const f of analysis.findings) {
    if ((f.citedQuestions ?? []).length < 2) continue;
    const hasProhibited = (f.statedNumbers ?? []).some((n) => {
      const c = classifyNumber(n, source, benchmark);
      return c.kind === "cross_question_sum" || c.kind === "forbidden_grouping";
    });
    if (hasProhibited) withProhibitedSum.push(f.id);
    else candidateSynthesis.push(f.id);
  }
  return { withProhibitedSum, candidateSynthesis };
}

// ── Top-level: run every deterministic + structured dimension ─────────────────
export function scoreBenchmark(analysis: AnalysisUnderTest, benchmark: Benchmark, source: SourceModel): BenchmarkScore {
  const { arithmetic, grounding } = scoreArithmeticAndGrounding(analysis, benchmark, source);
  const dimensions: DimensionResult[] = [
    arithmetic,
    grounding,
    scoreSelectivity(analysis, benchmark),
    scoreNotInSource(analysis, benchmark),
    scoreLexicalMustNotSay(analysis, benchmark, source),
    scoreMustFindRecall(analysis, benchmark),
    scoreRanking(analysis, benchmark),
    ...unscoreableDimensions(),
  ];
  const arithmeticViolations = (arithmetic.detail.violations as unknown[] | undefined)?.length ?? 0;
  const ungroundedNumbers = (grounding.detail.ungrounded as unknown[] | undefined)?.length ?? 0;
  const overBudget = analysis.findings.length > benchmark.selectivity.max_headline_findings;
  return {
    benchmarkId: benchmark.benchmark_id,
    producedBy: analysis.producedBy,
    dimensions,
    gate: { arithmeticViolations, ungroundedNumbers, overBudget },
  };
}

// ── small helpers ─────────────────────────────────────────────────────────────
function groupBy<T, K>(arr: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const t of arr) { const k = key(t); (m.get(k) ?? m.set(k, []).get(k)!).push(t); }
  return m;
}

/** Extract displayed numeric percentages/points from a prose string. */
export function numbersIn(text: string): number[] {
  return [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|pp|percentage points?|points?)/gi)].map((m) => round1(Number(m[1])));
}
