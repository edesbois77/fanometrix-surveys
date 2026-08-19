// ── Fanometrix Analytical Core — governance prompt fragments ──────────────────
// One concise fragment per rule, sourced from the SAME registry as the
// validators, so prompt guidance can stop drifting (Standard v1.1 §27). Wording
// reflects Standard v1.1 and preserves current production phrasing where
// equivalence matters. Stage 2 does NOT swap any production prompt to use these.
// Callers select the fragments they need (never one enormous governance prompt).

import type { RuleId } from "./rules";

export const PROMPT_FRAGMENTS: Record<string, string> = {
  unsupported_causation:
    "State causation only where the study design and evidence actually support causal inference. Otherwise do not use or imply causal language ('causes', 'drives', 'because of', 'led to'). Correlation, preference, sequence and demographic difference are not causation, and the absence of a causal word does not make a claim non-causal.",
  unsupported_trend:
    "Use change language ('increased', 'declined', 'grew', 'collapsed', 'trend', 'over time') only where governed evidence establishes a comparable change; 'trend' additionally needs at least three comparable time points. Without that, describe the difference between datasets, not a change over time.",
  aggregate_to_respondent_inference:
    "Claim a respondent-level relationship ('those who chose A were more likely to choose B', 'people who answered X also…') only when governed respondent-level evidence supports it. Aggregate distributions cannot establish it; and even with the relationship, do not read it as causation without causal evidence.",
  unsupported_statistical_language:
    "Reserve 'significant' / 'statistically significant' (and p-values, margin of error, confidence interval) for formal statistical significance backed by a supported statistical test. If you mean large / important / notable, say that instead. A described difference or spread is fine.",
  imprecise_significance_wording:
    "Do not use 'significant' to mean simply large or important — the word is reserved for statistical significance. Use 'large', 'notable', 'substantial' or an exact figure instead.",
  cross_question_arithmetic:
    "Two percentages from different questions are not the same measure. Never add them, and never call the space between them a 'gap', 'difference' or 'X points apart'. Connect their meaning, not their numbers.",
  invalid_semantic_grouping:
    "Only combine options into a grouping when they share the same measurement and a coherent broader construct, with no double counting and an accurate label. State the components. A grouped selection share is a selection total, not sentiment.",
  claim_exceeds_evidence:
    "Match claim strength to evidence: 'shows/indicates' for direct evidence, 'suggests/may imply' for inference. Causal and predictive claims are the hardest to establish. Do not let a descriptive result become a cause or a prediction.",
  preference_to_outcome_leap:
    "A measured preference, expectation or intention ('fans prefer X') does not establish a behavioural or commercial outcome ('providing X will improve Y'). Keep preference, implication and hypothesis distinct; do not assert the outcome unless the evidence measured it.",
  unsupported_recommendation_outcome:
    "A recommendation must not claim an outcome the research did not measure. Mark each recommendation as an evidence-supported direction, a strategic implication, or a hypothesis to test. Prefer 'consider testing…' where the effect is uncertain, not 'do X to increase Y'.",
  invalid_reference:
    "Cite only the supplied evidence ids. Never invent, guess or reference an id that is not in the governed evidence set.",
  unsupported_number:
    "State only figures present in the governed evidence. Never compute, estimate or introduce a new number.",
  comparison_evidence_insufficiency:
    "A comparison must rest on evidence for all sides, measured comparably. Do not assert a comparison without both sides present.",
  sample_composition_not_popularity:
    "Share of responses or collection volume is sample composition, not audience size, popularity, value or priority. Never call the largest group 'most popular' or a 'priority' on volume alone; a claim about a group must come from what that group actually said.",
  overstated_leadership:
    "Being numerically first does not make an option 'dominant', a 'clear winner' or 'overwhelming'. Let the size of the lead and the whole distribution set the language.",
  false_construct_contradiction:
    "Two measures contradict only if they measure the same thing in the same population. Opposite sentiment about different constructs (e.g. brand liking vs sponsorship sentiment) is not a contradiction.",
};

export function promptFragment(id: RuleId | string): string | undefined {
  return PROMPT_FRAGMENTS[id];
}

/** Assemble the fragments for a selected set of rules as a bulleted block.
 *  Deterministic order (input order), deduped. Callers pass only what they need. */
export function assembleFragments(ids: (RuleId | string)[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const id of ids) {
    const f = PROMPT_FRAGMENTS[id];
    if (f && !seen.has(id)) { seen.add(id); lines.push(`- ${f}`); }
  }
  return lines.join("\n");
}
