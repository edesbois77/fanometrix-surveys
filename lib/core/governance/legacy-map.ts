// ── Fanometrix Analytical Core — legacy equivalence + migration map ───────────
// For each registry rule: how the canonical Stage 2.1 policy relates to the
// CURRENT production implementations, and — for resolved conflicts — what will
// change in Studio/RP WHEN the canonical policy is eventually wired. Conflicts
// are named, never silently resolved. Nothing here is wired in Stage 2.1.

import type { EquivalenceStatus } from "./types";

export type LegacyDivergence = {
  ruleId: string;
  equivalence: EquivalenceStatus;
  divergence: string;
  /** The future migration effect when the canonical rule is wired (documented,
   *  not performed). */
  migration: string;
};

export const LEGACY_DIVERGENCES: LegacyDivergence[] = [
  {
    ruleId: "unsupported_causation", equivalence: "canonical_supersedes",
    divergence: "Studio hard-REJECTS the causal word (over-broad); RP admissibility-GRADES causation (closer to canonical) + a broader surface flag. Canonical: causal claims are permitted only with governed causal-support evidence, else blocking.",
    migration: "Studio would stop hard-rejecting causal wording outright and instead gate on governed causal support (relaxation where support exists; still blocking otherwise). RP's admissibility gate would be backed by an explicit causal-support signal.",
  },
  {
    ruleId: "unsupported_trend", equivalence: "canonical_supersedes",
    divergence: "Studio bans all change-over-time unconditionally and MISSES 'collapsed/shrank'; it also conflicts internally on 'improve' (allowed at analysis, banned at report). RP permits temporal for continuous-collection kinds. Canonical: governed by changeState, broadened vocabulary.",
    migration: "Studio would permit change language where a governed comparable-change/trend state exists (a relaxation) but also catch currently-missed words like 'collapsed' (a tightening). The analysis-vs-report 'improve' conflict is removed.",
  },
  {
    ruleId: "aggregate_to_respondent_inference", equivalence: "canonical_supersedes",
    divergence: "Two divergent Studio implementations (study-analysis rejects; survey-findings-engine throws, looser list). RP has no equivalent. Canonical consolidates one vocabulary and permits association WITH governed respondent evidence.",
    migration: "Studio's two lists converge to one; findings that carry governed respondent-level relationship evidence would be allowed to state the association (a relaxation), while causal readings stay blocked.",
  },
  {
    ruleId: "unsupported_statistical_language", equivalence: "canonical_supersedes",
    divergence: "Studio Analysis allows 'significant portion'; Studio Report bans the word 'significant' entirely (over-broad); RP has no word ban. Canonical reserves the statistical usages for a supported test.",
    migration: "Studio Report would no longer hard-ban the bare word; instead statistical usages require a supported test (see imprecise_significance_wording for the colloquial case).",
  },
  {
    ruleId: "imprecise_significance_wording", equivalence: "canonical_supersedes",
    divergence: "Studio Report bans the bare word 'significant'. Canonical downgrades the colloquial 'a significant proportion' to an ADVISORY wording correction (not a blocking statistical claim).",
    migration: "Studio Report's blocking bare-word ban becomes an advisory wording nudge; the blocking behaviour is reserved for genuine statistical usages.",
  },
  {
    ruleId: "cross_question_arithmetic", equivalence: "studio_only",
    divergence: "Studio's CROSS_Q_MAGNITUDE fires on prose only across ≥2 cited questions. RP has no equivalent. Canonical adds a deterministic sum-detector over structured Result/sourceOptions.",
    migration: "RP gains the concept; Studio gains a structured sum-detector that catches novel cross-question sums its regex misses.",
  },
  {
    ruleId: "invalid_semantic_grouping", equivalence: "new",
    divergence: "Only Studio's grouped-share≠sentiment guard exists. No product validates grouping metadata. Semantic coherence (55.8 vs 64.6) stays with the benchmark's declared lists.",
    migration: "New universal structural validation of declared groupings; no legacy behaviour is replaced (additive).",
  },
  {
    ruleId: "claim_exceeds_evidence", equivalence: "rp_only",
    divergence: "RP-only (ASSERTION_DEMAND + matrix 6.1). Studio has no claim-strength-vs-evidence gate. Canonical generalises it via the first-class Evidence.contribution field.",
    migration: "Studio findings would be gated by claim strength using canonical contribution kinds; RP behaviour is preserved but reads the canonical field.",
  },
  {
    ruleId: "preference_to_outcome_leap", equivalence: "conflict",
    divergence: "CONFLICT of enforcement. RP surfaces an invented-outcome flag (no block); Studio folds it into a prescription hard-drop. Canonical makes the unsupported outcome claim BLOCKING (evidence-invalid) unless governed outcome evidence exists.",
    migration: "RP's surface flag becomes blocking for asserted outcomes; Studio's prescription drop is refined to target the outcome claim specifically.",
  },
  {
    ruleId: "unsupported_recommendation_outcome", equivalence: "conflict",
    divergence: "CONFLICT of enforcement. Studio hard-drops prescriptions; RP relies on prompt discipline. Canonical: recommendations are legitimate but must be tiered; a bare prescription is advisory (the unsupported OUTCOME is handled by preference_to_outcome_leap).",
    migration: "Studio's blanket prescription hard-drop is relaxed to an advisory 'tier this recommendation'; RP gains a deterministic advisory signal.",
  },
  {
    ruleId: "invalid_reference", equivalence: "equivalent",
    divergence: "EQUIVALENT in intent (both fail closed on unknown refs). Studio uses opaque string refs + resolver; RP uses integer indices + clampReferences.",
    migration: "None functional; both products would call one abstract governed-ref check.",
  },
  {
    ruleId: "unsupported_number", equivalence: "equivalent",
    divergence: "EQUIVALENT in intent. Studio Report rejects orphan stat tokens; RP surfaces orphan percentages.",
    migration: "None functional; unified check requires a governed number set from the caller.",
  },
  {
    ruleId: "comparison_evidence_insufficiency", equivalence: "stricter_in_studio",
    divergence: "STRICTER IN STUDIO (≥2 refs / one question / ≥2 surveys). RP governs by instrument/population comparability. Canonical adopts the minimal universal 'both sides present'.",
    migration: "The canonical minimum is weaker than Studio's full firewall; Studio would keep its extra comparability checks as product-specific until full comparability lands centrally.",
  },
  {
    ruleId: "sample_composition_not_popularity", equivalence: "conflict",
    divergence: "CONFLICT of coverage. RP states the full 'volume ≠ popularity/value/priority' rule in PROMPTS only (no regex); Studio bans only 'priority from share' via regex. Only the lexical subset is deterministically checkable.",
    migration: "RP's prompt-only rule gains a heuristic detector; Studio's narrow regex widens to popularity/value wording. Remains advisory (lexical cannot distinguish measured popularity).",
  },
  {
    ruleId: "overstated_leadership", equivalence: "stricter_in_studio",
    divergence: "STRICTER IN STUDIO (structural DOMINANCE_MIN_LEAD_PP). Canonical prose flag is heuristic (no lead size in prose) → advisory.",
    migration: "Studio keeps its structural lead-size gate; the canonical prose flag is an additional advisory aid, not a replacement.",
  },
  {
    ruleId: "false_construct_contradiction", equivalence: "rp_only",
    divergence: "RP-ONLY (3 layers, slightly divergent regexes). Studio has no construct-comparability concept.",
    migration: "Studio gains the advisory construct-comparability flag; RP's three layers would converge on the canonical pattern.",
  },
];

const BY_ID = new Map(LEGACY_DIVERGENCES.map((d) => [d.ruleId, d]));
export function getDivergence(ruleId: string): LegacyDivergence | undefined { return BY_ID.get(ruleId); }
