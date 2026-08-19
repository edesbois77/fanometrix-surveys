// ── Fanometrix Analytical Core — governance validators (pure) ─────────────────
// Deterministic (structured) + heuristic (lexical) checks that project the rule
// registry onto Core contracts. Additive/shadowed — NOT wired into production.
// Each issue records HOW it was detected (deterministic vs heuristic); a clean
// heuristic pass is never proof a semantic violation is absent.

import type { Finding } from "../findings/types";
import type { Result } from "../evidence/types";
import type { GovernanceContext, ValidationIssue, Severity, Enforcement } from "./types";
import { getRule } from "./rules";
import {
  CAUSAL_PATTERNS, TREND_PATTERN, TREND_WORD, RESPONDENT_INFERENCE_PATTERNS,
  SIGNIFICANCE_PATTERNS, REPORT_SIGNIFICANCE,
  OUTCOME_PATTERN, PRESCRIPTION_MARKERS, PRIORITY_FROM_SHARE, POPULARITY_FROM_VOLUME,
  OVERSTATED_LEADERSHIP, SHARE_AS_SENTIMENT, CROSS_Q_MAGNITUDE, STAT_TOKEN,
  CONTRADICTION_FRAMING, SUBJECT_ATTITUDE, ACTIVITY_SENTIMENT, extractRefTokens, anyMatch,
} from "./patterns";

const round1 = (x: number): number => Math.round(x * 10) / 10;
const approxIn = (n: number, set: number[], tol = 0.05): boolean => set.some((v) => Math.abs(v - n) <= tol);

/** Build a ValidationIssue, taking severity from the rule and enforcement from
 *  the detection method used. */
function issue(ruleId: string, enforcement: Enforcement, message: string, extra?: Partial<ValidationIssue>): ValidationIssue {
  const rule = getRule(ruleId);
  const severity: Severity = rule?.severity ?? "advisory";
  return { ruleId, severity, blocking: severity === "blocking", enforcement, message, ...extra };
}

// ── Cross-question arithmetic helper (deterministic, structured) ──────────────
function explainCrossQuestionSum(
  value: number,
  options: { question: string; option: string; pct: number }[],
): { terms: { question: string; option: string; pct: number }[] } | null {
  for (let size = 2; size <= Math.min(3, options.length); size++) {
    const idx = options.map((_, i) => i);
    const combos: number[][] = [];
    const rec = (start: number, acc: number[]) => {
      if (acc.length === size) { combos.push([...acc]); return; }
      for (let i = start; i < idx.length; i++) { acc.push(i); rec(i + 1, acc); acc.pop(); }
    };
    rec(0, []);
    for (const c of combos) {
      const terms = c.map((i) => options[i]);
      const sum = round1(terms.reduce((s, t) => s + t.pct, 0));
      if (Math.abs(sum - value) <= 0.05 && new Set(terms.map((t) => t.question)).size > 1) return { terms };
    }
  }
  return null;
}

/** Numbers stated in prose (percentage/point tokens). */
function numbersIn(text: string): number[] {
  return (text.match(STAT_TOKEN) ?? []).map((t) => round1(Number(t.replace(/[^\d.]/g, "")))).filter((n) => Number.isFinite(n));
}

// ── Prose (heuristic) rule pass — with STRUCTURED-EVIDENCE PRECEDENCE ──────────
// Precedence (Stage 2.1): governed structured state wins; the heuristic is a
// safety net that fires only when the structured gate is NOT satisfied. A clean
// heuristic pass never proves absence of a semantic violation.
function proseHeuristics(text: string, ctx: GovernanceContext): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const span = text.slice(0, 160);

  // Causation — permitted only with governed causal support (§21). Safe default: block.
  if (anyMatch(CAUSAL_PATTERNS, text) && ctx.causalSupportEstablished !== true) {
    out.push(issue("unsupported_causation", "heuristic", "causal language without governed causal-support evidence", { span }));
  }

  // Temporal — governed by changeState (Decision 6). 'trend' word needs state 'trend';
  // other change words need 'comparable_change' or 'trend'.
  if (TREND_PATTERN.test(text)) {
    const state = ctx.changeState;
    const isTrendWord = TREND_WORD.test(text);
    const allowed = isTrendWord ? state === "trend" : state === "comparable_change" || state === "trend";
    if (!allowed) out.push(issue("unsupported_trend", "heuristic", isTrendWord ? "trend language without a governed 'trend' change state (≥3 comparable points)" : "change-over-time language without a governed comparable-change state", { span }));
  }

  // Respondent-level inference — allowed only with governed respondent evidence.
  if (ctx.hasRespondentEvidence !== true && anyMatch(RESPONDENT_INFERENCE_PATTERNS, text)) {
    out.push(issue("aggregate_to_respondent_inference", "heuristic", "respondent-level relationship claim without governed respondent evidence", { span }));
  }

  // Statistical-significance wording — reserved for a supported test.
  const supported = ctx.statisticalAssessment?.status === "supported";
  if (!supported) {
    if (anyMatch(SIGNIFICANCE_PATTERNS, text)) {
      out.push(issue("unsupported_statistical_language", "heuristic", "statistical-significance wording without a supported statisticalAssessment", { span }));
    } else if (REPORT_SIGNIFICANCE.test(text)) {
      out.push(issue("imprecise_significance_wording", "heuristic", "'significant' used non-statistically — reserve the word for statistical significance; use 'large/notable' or an exact figure", { span }));
    }
  }

  // Preference → outcome (blocking unless the outcome relationship is governed).
  if (OUTCOME_PATTERN.test(text) && ctx.outcomeEvidenceEstablished !== true) {
    out.push(issue("preference_to_outcome_leap", "heuristic", "asserts a commercial outcome as a result without governed action→outcome evidence", { span }));
  }
  // Prescriptive recommendation without an evidence tier (advisory).
  if (anyMatch(PRESCRIPTION_MARKERS, text)) out.push(issue("unsupported_recommendation_outcome", "heuristic", "prescriptive recommendation — mark its tier (evidence-supported / strategic / hypothesis) and confirm any outcome was measured", { span }));

  if (PRIORITY_FROM_SHARE.test(text) || POPULARITY_FROM_VOLUME.test(text)) out.push(issue("sample_composition_not_popularity", "heuristic", "sample composition / share described as popularity or priority", { span }));
  if (OVERSTATED_LEADERSHIP.test(text)) out.push(issue("overstated_leadership", "heuristic", "overstated leadership language — confirm the lead size justifies it", { span }));
  if (CONTRADICTION_FRAMING.test(text) && SUBJECT_ATTITUDE.test(text) && ACTIVITY_SENTIMENT.test(text)) {
    out.push(issue("false_construct_contradiction", "heuristic", "frames two different constructs as contradictory", { span }));
  }
  return out;
}

// ── Public: validate arbitrary analytical prose ───────────────────────────────
export function validateProse(text: string, ctx: GovernanceContext = {}): ValidationIssue[] {
  const out = proseHeuristics(text, ctx);
  // Deterministic: unsupported numbers.
  if (ctx.governedNumbers) {
    for (const n of numbersIn(text)) {
      if (!approxIn(n, ctx.governedNumbers)) out.push(issue("unsupported_number", "deterministic", `stated number ${n} is not in the governed evidence set`));
    }
  }
  // Deterministic: invalid references.
  if (ctx.governedRefs) {
    const allowed = new Set(ctx.governedRefs);
    for (const ref of extractRefTokens(text)) {
      if (!allowed.has(ref)) out.push(issue("invalid_reference", "deterministic", `cites unknown evidence ref "${ref}"`, { refs: [ref] }));
    }
  }
  // Deterministic: cross-question arithmetic (a stated number that is a cross-question sum).
  if (ctx.sourceOptions) {
    for (const n of numbersIn(text)) {
      const x = explainCrossQuestionSum(n, ctx.sourceOptions);
      if (x) out.push(issue("cross_question_arithmetic", "deterministic", `stated number ${n} sums percentages from more than one question`, { span: text.slice(0, 160) }));
    }
  }
  return out;
}

// ── Public: validate a Result ─────────────────────────────────────────────────
export function validateResult(result: Result, ctx: GovernanceContext = {}): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  // Comparison sufficiency (deterministic).
  if (result.operation === "comparison" && (result.components?.length ?? 0) < 2) {
    out.push(issue("comparison_evidence_insufficiency", "deterministic", "a comparison must cite ≥2 evidence components (both sides)"));
  }
  // Semantic-grouping structural validity (deterministic).
  if (result.grouping) {
    const comps = result.components ?? [];
    if (comps.length < 2) out.push(issue("invalid_semantic_grouping", "deterministic", "a grouping needs ≥2 components"));
    if (result.grouping.componentLabels.length !== comps.length) out.push(issue("invalid_semantic_grouping", "deterministic", "grouping label count does not match component count"));
    if (!result.grouping.parentConstruct?.trim()) out.push(issue("invalid_semantic_grouping", "deterministic", "grouping has no coherent parent construct"));
    // Heuristic: grouped share stated as sentiment.
    const label = `${result.label ?? ""} ${result.grouping.parentConstruct ?? ""}`;
    if (SHARE_AS_SENTIMENT.test(label)) out.push(issue("invalid_semantic_grouping", "heuristic", "a grouped selection share is described as sentiment/approval"));
  }
  // Cross-question arithmetic on the Result's own value (deterministic, needs sourceOptions).
  if (ctx.sourceOptions && result.quantity) {
    const x = explainCrossQuestionSum(round1(result.quantity.value), ctx.sourceOptions);
    if (x) out.push(issue("cross_question_arithmetic", "deterministic", "the Result value sums percentages from more than one question", { refs: result.components }));
  }
  return out;
}

// ── Public: validate a Finding ────────────────────────────────────────────────
export function validateFinding(finding: Finding, ctx: GovernanceContext = {}): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  // Reference grounding defaults to the finding's own evidence ids when the
  // caller supplies no explicit governed set.
  const refCtx: GovernanceContext = { ...ctx, governedRefs: ctx.governedRefs ?? finding.evidence.map((e) => e.id) };

  // Prose + number/ref/arithmetic checks over the claim statement.
  out.push(...validateProse(finding.statement, refCtx));

  // Cross-question magnitude heuristic (Studio) — only when the claim spans ≥2 questions.
  if ((finding.questions?.length ?? 0) >= 2 && CROSS_Q_MAGNITUDE.test(finding.statement)) {
    out.push(issue("cross_question_arithmetic", "heuristic", "compares the numeric magnitude of measures from different questions"));
  }

  // Claim exceeds evidence (deterministic-structured): a causal/predictive claim
  // needs ≥2 distinct contribution kinds (RP rule 6.1) or a supported test.
  if (finding.assertionType === "causal" || finding.assertionType === "predictive") {
    // Canonical, product-agnostic: use the first-class Evidence.contribution
    // (falls back to legacy RP sourceMeta, then sourceType/kind, only when the
    // canonical field is absent — never invents one).
    const kinds = new Set(
      finding.evidence.map((e) => {
        const legacy = (e.sourceMeta as Record<string, unknown> | undefined)?.contribution_kind;
        return e.contribution ?? (typeof legacy === "string" && legacy ? legacy : undefined) ?? e.sourceType ?? e.kind;
      }),
    );
    const supported = finding.statisticalAssessment?.status === "supported";
    if (kinds.size < 2 && !supported) {
      out.push(issue("claim_exceeds_evidence", "deterministic", `${finding.assertionType} claim rests on fewer than two independent evidence contribution kinds and no supported statistical test`));
    }
  }

  // Comparative claim must have ≥2 evidence items.
  if (finding.assertionType === "comparative" && finding.evidence.length < 2) {
    out.push(issue("comparison_evidence_insufficiency", "deterministic", "a comparative claim must cite evidence for both sides"));
  }
  for (const cmp of finding.comparisons ?? []) out.push(...validateResult(cmp, ctx));

  return out;
}

/** Convenience: only the blocking issues. */
export const blockingIssues = (issues: ValidationIssue[]): ValidationIssue[] => issues.filter((i) => i.blocking);
