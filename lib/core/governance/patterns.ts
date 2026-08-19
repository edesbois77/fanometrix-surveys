// ── Fanometrix Analytical Core — governance lexical patterns (HEURISTIC) ──────
// Centralised, verbatim-preserved patterns lifted from the CURRENT production
// governance implementations, so shadow validators are behaviour-equivalent.
//
// EVERY pattern here is a HEURISTIC: a high-precision text match that FLAGS a
// likely violation. A clean pass is NEVER proof a semantic violation is absent
// (paraphrases evade lexical checks). Deterministic, structured checks live in
// validators.ts; these back only the heuristic tier.
//
// Provenance is recorded per group so the legacy map can prove equivalence.

// ── Causation ────────────────────────────────────────────────────────────────
// Survey Studio study-analysis.ts:195-197 (BANNED_PATTERNS — REJECTS).
export const STUDIO_CAUSAL_WORD = /\bcaus(?:e|es|ed|ing|al)\b/i;
export const STUDIO_CAUSAL_PHRASE = /\b(?:driven by|drives|drove|resulted in|results in|led to|leads to|because of|due to|as a result of)\b/i;
// Research Projects review-detectors.ts:61 (surface-only flag — broader).
export const RP_CAUSAL = /\b(because of|because|due to|driven by|as a result of|owing to|stems from|leads to|caused by|the reason (?:for|behind)|attributed to|explained by|a result of|reflects the|can be explained|linked to|emblematic of|symptomatic of|indicative of|a symptom of|associated with|connected to|aligns with (?:the|this|that|these|those|a|an))\b/i;
export const CAUSAL_PATTERNS = [STUDIO_CAUSAL_WORD, STUDIO_CAUSAL_PHRASE, RP_CAUSAL];

// ── Temporal / change-over-time ──────────────────────────────────────────────
// LEGACY (verbatim): Survey Studio study-analysis.ts:202 BANNED_PATTERNS.
export const STUDIO_TREND = /\b(?:increas(?:e|ed|es|ing)|decreas(?:e|ed|es|ing)|grew|grown|growing|declin(?:e|ed|es|ing)|ris(?:en|ing)|fell|fallen|falling|upward|downward|trend(?:s|ing|ed)?|over time|year[- ]on[- ]year|month[- ]on[- ]month)\b/i;
// CANONICAL (Stage 2.1 — STRICTER than legacy): the legacy Studio set misses
// "collapsed/collapse/shrink/shrank/worsened/strengthened/weakened/rose/improved".
// Standard v1.1 §11.4 governs all change wording. Whether it is a VIOLATION still
// depends on the governed changeState (precedence lives in validators.ts); this
// vocabulary only detects change wording.
export const TREND_PATTERN = /\b(?:increas(?:e|ed|es|ing)|decreas(?:e|ed|es|ing)|grew|grown|growing|declin(?:e|ed|es|ing)|ris(?:e|en|es|ing)|rose|fell|fallen|falling|drop(?:s|ped|ping)?|surg(?:e|ed|es|ing)|collaps(?:e|ed|es|ing)|shrink(?:s|ing)?|shr(?:ank|unk)|weaken(?:s|ed|ing)?|strengthen(?:s|ed|ing)?|worsen(?:s|ed|ing)?|improv(?:e|ed|es|ing)|upward|downward|trend(?:s|ing|ed)?|trending|over time|year[- ]on[- ]year|month[- ]on[- ]month)\b/i;
// Just the "trend" family — used for the stricter "trend requires ≥3 points" gate.
export const TREND_WORD = /\btrend(?:s|ing|ed)?\b/i;

// ── Aggregate → respondent inference (correlation firewall) ───────────────────
// Survey Studio study-analysis.ts:293-303 (analysis firewall — REJECTS, scoped).
export const STUDIO_RESPONDENT_CORRELATION = [
  /\b(?:those|respondents|people|fans|users|viewers)\s+who\b[^.?!]{0,90}\b(?:(?:more|less)\s+likely|also\s+(?:chose|selected|answered|said|preferred|felt|reported|picked|wanted|tended|were|are|had|showed)|tend(?:ed)?\s+to)\b/i,
  /\bthe same (?:respondents|people|fans|users|group)\b[^.?!]{0,90}\b(?:also|both|were|held|preferred|chose|felt|tend)\b/i,
  /\bcorrelat(?:e|es|ed|ion|ing)\b/i,
];
// Survey Studio survey-findings-engine.ts:93-106 (deterministic engine — THROWS, looser).
export const ENGINE_CORRELATION_BANNED = [
  /\bmore likely\b/i,
  /\bwho answered\b/i,
  /\bthose who\b/i,
  /\bthe same (respondents|people|fans)\b/i,
  /\bcorrelat/i,
  /\brespondents (positive|who)\b/i,
  /\balso (chose|answered|said|selected)\b/i,
];
export const RESPONDENT_INFERENCE_PATTERNS = [...STUDIO_RESPONDENT_CORRELATION, ...ENGINE_CORRELATION_BANNED];

// ── Statistical-significance language ─────────────────────────────────────────
// Survey Studio study-analysis.ts:182-194 (analysis cluster — REJECTS the
// statistical usages; ALLOWS colloquial "significant portion").
export const SIGNIFICANCE_PATTERNS = [
  /\bstatistical(?:ly)?\s+significan(?:t|ce)\b/i,
  /\bsignificantly\b/i,
  /\bsignifican(?:t|ce)\s+(?:difference|differences|gap|margin|lead|edge|contrast|variation|disparity|advantage|majority)\b/i,
  /\bp\s*[<=>]\s*0?\.\d+/i,
  /\bmargin of error\b/i,
  /\bconfidence interval\b/i,
  /\bmeaningful(?:ly)?\s+(?:difference|different|higher|lower|gap)\b/i,
  /\bmaterially\s+(?:higher|lower|different|more|less|greater)\b/i,
];
// Survey Studio report-domain.ts:126 (Report layer — STRICTER: bans the word entirely).
export const REPORT_SIGNIFICANCE = /\bsignifican(?:t|tly|ce)\b/i;

// ── Cross-question magnitude comparison ───────────────────────────────────────
// Survey Studio study-analysis.ts:279 (fires only across ≥2 distinct questions).
export const CROSS_Q_MAGNITUDE = /\b(?:gap between|difference between|differ(?:s|ence)? (?:from|between)|higher than|lower than|greater than|less than|more than|fewer than|outpaces?|outstrips?|exceeds?|trails?|lags? behind|compared (?:to|with)|relative to|\d[\d.]*\s*(?:percentage points?|pp|%)\s*(?:higher|lower|more|less|greater|above|below|apart))\b/i;

// ── Grouped-share stated as sentiment ─────────────────────────────────────────
// Survey Studio study-analysis.ts:258 (fires only when a grouped_share ref is cited).
export const SHARE_AS_SENTIMENT = /\b(?:positiv\w*|favou?rabl\w*|approv\w*|endors\w*|good sponsor|positive sentiment|support (?:the|for the) sponsorship)/i;

// ── Preference → outcome / invented outcome ───────────────────────────────────
// Research Projects review-detectors.ts:62 (surface-only invented_outcome flag).
export const OUTCOME_PATTERN = /\b(enhanc\w+|boost\w*|increas\w+|strengthen\w*|improv\w+|driv\w+|maximis\w+|maximiz\w+)\s+(?:its?\s+|their\s+|brand\s+)?(loyalty|affinity|engagement|awareness|perception|presence|sentiment|reputation|image|appeal)\b/i;

// ── Recommendation / prescription ─────────────────────────────────────────────
// Survey Studio analysis-quality.ts:61-75 (hard-drop) + report RECO/FILLER.
export const PRESCRIPTION_MARKERS = [
  /\b(?:should|must|need(?:s)?\s+to|ought\s+to|have\s+to)\s+(?:launch|invest|roll\s+out|deploy|target|run|spend|prioriti[sz]e|focus\s+on|leverage|develop|create|build|introduce|expand|increase\s+spend|boost|drive|capitalis?e|maximis?e|pursue|adopt|implement)\b/i,
  /\b(?:recommend(?:s|ed|ation|ations)?|we\s+advise|it\s+is\s+advis(?:able|ed))\b/i,
  /\bstrategy\s+should\b/i,
  /\bcould\s+improve\s+(?:by|through)\b/i,
  /\b(?:potential|opportunity)\s+(?:for\s+\w+\s+)?to\s+(?:leverage|capitalis?e\s+on|monetis?e|drive\s+sales|run\s+campaigns?|target\s+(?:new|specific))\b/i,
];

// ── Sample composition ≠ popularity / priority ───────────────────────────────
// Survey Studio study-analysis.ts:204 (priority-from-share — REJECTS).
export const PRIORITY_FROM_SHARE = /\b(?:top|main|highest|biggest|number[- ]?one|primary|key)\s+priorit/i;
// Research Projects analyseSurvey/Conversation/ExecutiveReport (prompt-only — the
// "most popular / most valuable / largest audience" wording, no production regex).
export const POPULARITY_FROM_VOLUME = /\b(?:most popular|most valuable|largest audience|biggest audience|priority (?:market|segment|audience))\b/i;

// ── Overstated leadership ─────────────────────────────────────────────────────
// Benchmark 001 MUST-NOT-SAY #1 ("dominant" on a small lead).
export const OVERSTATED_LEADERSHIP = /\b(?:dominant|dominates?|clear winner|overwhelming(?:ly)?|vast majority|strong preference|decisive)\b/i;

// ── Construct-comparability / false contradiction ─────────────────────────────
// Research Projects review-detectors.ts:91-93 (surface-only false_contradiction).
export const CONTRADICTION_FRAMING = /\b(dichotom\w+|discrepanc\w+|divergen\w+|disconnect|paradox\w*|contradict\w+|mismatch|at odds|conflicting|opposing|incongru\w+|tension between)\b/i;
export const SUBJECT_ATTITUDE = /\b(likes?|liking|dislikes?|dislik\w+|hate\w*|love\w*|prefer\w*|favou?rs?|favou?rable opinion|opinion of|attitude toward|personal (?:brand )?sentiment|brand sentiment|brand perception|brand dislike)\b/i;
export const ACTIVITY_SENTIMENT = /\b(sponsorship|sponsor\w*|campaign\w*|marketing|advertis\w*|partnership\w*|activation\w*)\b/i;

// ── Numeric / reference grounding ─────────────────────────────────────────────
// Survey Studio report-domain.ts:91 (unsupported statistic token).
export const STAT_TOKEN = /\d+(?:\.\d+)?\s*(?:%|pp)|\b\d+\.\d+\b/g;
// Survey Studio study-analysis.ts:244-250 (inline reference detection).
export const INLINE_REF_PATTERNS = [
  /(?:id|ref)s?\s*[:=]\s*(?:"|')?e\d+/i,
  /\[\s*(?:"|')?e\d+/,
  /\(\s*(?:"|')?e\d+\b/,
  /(?:"|')e\d+(?:"|')/,
  /\b(?:study|survey)#/i,
];
/** Extract short evidence-ref tokens (e1, e12, …) from prose. */
export function extractRefTokens(text: string): string[] {
  return [...new Set((text.match(/\be\d+\b/g) ?? []))];
}
/** True if any pattern in `list` matches. */
export const anyMatch = (list: RegExp[], text: string): boolean => list.some((re) => re.test(text));
