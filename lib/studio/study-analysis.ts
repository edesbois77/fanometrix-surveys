// ── Survey Studio — Study Analysis (pure evidence contract + validation) ─────
// AI ASSISTANCE, not authority. The AI proposes interpretation; the trusted Study
// Results layer remains the ONLY source of counts/%/bases/identity/comparability.
// This module is pure (no DB, no network): it (1) turns governed Study Results into
// a BOUNDED AI evidence payload with deterministic evidence refs, and (2) validates
// AI output so no proposal can cite evidence that wasn't supplied or overclaim in
// ways we can detect. The provider call + persistence live elsewhere (gated).

import type { StudyResultGroup } from "@/lib/studio/study-results";
import type { ResultMode } from "@/lib/studio/survey-results-resolve";
import { buildDerivedEvidence, type DerivedEvidenceItem } from "@/lib/studio/study-derived-evidence";
import type { SegmentDerivedItem } from "@/lib/studio/study-segments";

// ── Evidence payload (server → prompt) ───────────────────────────────────────
export type EvidenceScope = "combined" | "survey";

/** One citable statistic. `ref` is the ONLY handle the AI may cite. */
export type EvidenceItem = {
  ref: string;
  canonicalQuestionKey: string;
  question: string;
  comparability: StudyResultGroup["comparability"];
  scope: EvidenceScope;
  surveyId: string | null;      // set when scope = "survey"
  surveyName: string | null;
  questionId: string | null;    // survey-scoped question identity
  questionIndex: number | null;
  optionId: string;
  optionLabel: string;
  count: number;
  base: number;                 // the answered base for THIS statistic (never the study total)
  percentage: number | null;
  resultMode: ResultMode | null;
  // ── Governed semantic metadata (Stage 5D) — captured from the INSTRUMENT at
  //    analysis time so the immutable snapshot preserves the semantic state, and the
  //    Core shadow adapter can map it faithfully. Absent when the question declares no
  //    governed scale (never inferred). scaleType/constructKey repeat per option row
  //    of a question (question-level facts); ordinalPosition/polarity are per option. ──
  scaleType?: "nominal" | "ordinal" | "binary" | "interval";
  constructKey?: string;
  ordinalPosition?: number;
  polarity?: "positive" | "neutral" | "negative";
};

export type StudyAnalysisEvidence = {
  study: {
    id: string; name: string; objective: string | null;
    surveyCount: number;
    /** The exact constituent Survey ids analysed (sorted) — the run's membership
     *  context. Compared as a SET for staleness so [A,B] → [A,C] is detected even
     *  though the count is unchanged. */
    surveyIds: string[];
    completedResponses: number;   // OPERATIONAL total — NOT a question base
    respondentUniquenessProven: false; // historical Studio data has no respondent identity
  };
  evidence: EvidenceItem[];
  /** Deterministic server-computed derived facts (leader/spread/top-2/consistency),
   *  each with its own ref + the base refs it came from. Cited/interpreted like base
   *  evidence; the model never computes its own arithmetic. */
  derived: DerivedEvidenceItem[];
  /** Deterministic AUDIENCE facts (by country/…): reversal/spread/consistency/concentration
   *  that let the analyst TEST whether the overall story holds across segments. Citable like
   *  derived facts; server-computed; neutral, descriptive wording only. */
  segmentDerived: SegmentDerivedItem[];
};

// The research scope a ref belongs to. "study" (default) keeps every existing Study
// Analysis ref byte-identical; "survey" is the additive single-survey namespace. This
// is what makes ONE validation firewall serve both Study and Survey analysis.
export type ResearchNamespace = "study" | "survey";

/** Deterministic, opaque-ish evidence ref. Same inputs → same ref (test/audit-stable).
 *  `ns` defaults to "study" so all existing Study callers are unchanged. */
export function evidenceRef(scopeId: string, canonicalQuestionKey: string, optionId: string, scope: EvidenceScope, surveyId?: string | null, ns: ResearchNamespace = "study"): string {
  const src = scope === "combined" ? "combined" : `survey#${surveyId ?? ""}`;
  return `${ns}#${scopeId}|q#${canonicalQuestionKey}|opt#${optionId}|src#${src}`;
}

/**
 * Build the bounded AI evidence payload from governed Study Results. Emits, per
 * result group: the combined option stats (when comparability === "combined") AND
 * every source Survey's option stats — each with a deterministic ref. No raw
 * responses, no per-language label duplication (labels already display-resolved),
 * no study-total-as-base.
 */
export function buildStudyAnalysisEvidence(
  study: { id: string; name: string; objective: string | null; surveyCount: number; completedResponses: number; surveyIds?: string[] },
  resultGroups: StudyResultGroup[],
  segmentDerived: SegmentDerivedItem[] = [],
): StudyAnalysisEvidence {
  const evidence: EvidenceItem[] = [];
  for (const g of resultGroups) {
    if (g.comparability === "combined" && g.combined) {
      for (const o of g.combined.options) {
        evidence.push({
          ref: evidenceRef(study.id, g.canonicalQuestionKey, o.optionId, "combined"),
          canonicalQuestionKey: g.canonicalQuestionKey, question: g.label, comparability: g.comparability,
          scope: "combined", surveyId: null, surveyName: null, questionId: null, questionIndex: null,
          optionId: o.optionId, optionLabel: o.label, count: o.count, base: g.combined.base, percentage: o.percentage, resultMode: null,
        });
      }
    }
    for (const s of g.sources) {
      for (const o of s.options) {
        evidence.push({
          ref: evidenceRef(study.id, g.canonicalQuestionKey, o.optionId, "survey", s.surveyId),
          canonicalQuestionKey: g.canonicalQuestionKey, question: g.label, comparability: g.comparability,
          scope: "survey", surveyId: s.surveyId, surveyName: s.surveyName, questionId: s.questionId, questionIndex: s.questionIndex,
          optionId: o.optionId, optionLabel: o.label, count: o.count, base: s.base, percentage: o.percentage, resultMode: s.resultMode,
        });
      }
    }
  }
  return {
    study: {
      id: study.id, name: study.name, objective: study.objective,
      surveyCount: study.surveyCount,
      surveyIds: [...(study.surveyIds ?? [])].map(String).sort(), // sorted → order-independent set
      completedResponses: study.completedResponses,
      respondentUniquenessProven: false,
    },
    evidence,
    derived: buildDerivedEvidence(study.id, resultGroups),
    segmentDerived,
  };
}

/** Deterministic canonical string of the evidence payload — stable key ordering so
 *  the same governed evidence always hashes identically (rerun-dedupe / audit seam).
 *  Pure; the sha256 itself is computed by the server (node:crypto). */
export function canonicalEvidenceString(payload: StudyAnalysisEvidence): string {
  const sortKeys = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === "object") {
      return Object.keys(v as Record<string, unknown>).sort().reduce((acc, k) => {
        acc[k] = sortKeys((v as Record<string, unknown>)[k]); return acc;
      }, {} as Record<string, unknown>);
    }
    return v;
  };
  return JSON.stringify(sortKeys(payload));
}

// ── Proposal domain model (pure) ─────────────────────────────────────────────
// STORED type — the persisted enum (study_analysis_proposals.type CHECK). Kept to three
// so no migration is needed.
export type ProposalType = "observation" | "comparison" | "synthesis";
export const PROPOSAL_TYPES: ProposalType[] = ["observation", "comparison", "synthesis"];

// DISPLAY kind — the richer analytical artifact the analyst may produce. Higher-order
// kinds (pattern/tension/implication) are a PRESENTATION distinction; they persist in the
// run snapshot (like priority), NOT in a new DB column. Each maps to a stored enum value.
export type ArtifactKind = "observation" | "comparison" | "pattern" | "tension" | "synthesis" | "implication";
export const ARTIFACT_KINDS: ArtifactKind[] = ["observation", "comparison", "pattern", "tension", "synthesis", "implication"];
/** Map a rich analytical kind to the persisted enum (no migration). comparison keeps its
 *  governed firewall; every multi-evidence higher-order kind stores as "synthesis". */
export function storedTypeOf(kind: ArtifactKind): ProposalType {
  if (kind === "comparison") return "comparison";
  if (kind === "observation") return "observation";
  return "synthesis"; // pattern | tension | synthesis | implication
}
/** Which kinds are higher-order (connect ≥2 evidence points into a relationship). */
const MULTI_EVIDENCE_KINDS = new Set<ArtifactKind>(["comparison", "pattern", "tension", "synthesis"]);

/** Presentation priority — NOT a governance signal. "key" = high-materiality, likely to
 *  matter to the objective/report; "supporting" = a legitimate secondary observation shown
 *  to the analyst but less likely to become a headline Finding. Both are fully validated. */
export type ProposalPriority = "key" | "supporting";

/** An AI-proposed insight AFTER server validation. Numbers live in the cited evidence,
 *  never in the proposal — the prose is interpretation only. `type` is the persisted enum;
 *  `displayType` is the richer analytical kind shown to the analyst (snapshot-only). */
export type StudyAnalysisProposal = {
  type: ProposalType;
  displayType: ArtifactKind;
  priority: ProposalPriority;
  headline: string;
  explanation: string;
  evidenceRefs: string[];
};

export type RejectedProposal = { proposal: Partial<StudyAnalysisProposal>; reasons: string[] };
export type ValidationResult = { valid: StudyAnalysisProposal[]; rejected: RejectedProposal[] };

const HEADLINE_MAX = 160;
const EXPLANATION_MAX = 700;

// Language we must NOT accept unless a governed layer proved it (there is none in V1).
// The evidence is CROSS-SECTIONAL aggregate share — it cannot support significance,
// causation, change-over-time, inferred priority, or unique-people claims.
const BANNED_PATTERNS: { re: RegExp; why: string }[] = [
  // Statistical significance — target the STATISTICAL usage, not the colloquial "a
  // significant portion/opportunity" (which is reasonable interpretation, per the
  // governance policy): reject "statistically significant", the adverb "significantly",
  // "significant/statistical significance", and "significant <comparison-noun>".
  { re: /\bstatistical(?:ly)?\s+significan(?:t|ce)\b/i, why: "statistical-significance claim (no governed test exists)" },
  { re: /\bsignificantly\b/i, why: "significance claim (no governed test exists)" },
  { re: /\bsignifican(?:t|ce)\s+(?:difference|differences|gap|margin|lead|edge|contrast|variation|disparity|advantage|majority)\b/i, why: "significance claim (no governed test exists)" },
  { re: /\bp\s*[<=>]\s*0?\.\d+/i, why: "p-value claim" },
  { re: /\bmargin of error\b/i, why: "margin-of-error claim" },
  { re: /\bconfidence interval\b/i, why: "confidence-interval claim" },
  { re: /\bmeaningful(?:ly)?\s+(?:difference|different|higher|lower|gap)\b/i, why: "unsupported 'meaningful difference' claim" },
  { re: /\bmaterially\s+(?:higher|lower|different|more|less|greater)\b/i, why: "unsupported 'materially higher/lower' claim" },
  // Causation.
  { re: /\bcaus(?:e|es|ed|ing|al)\b/i, why: "causal claim" },
  { re: /\b(?:driven by|drives|drove|resulted in|results in|led to|leads to|because of|due to|as a result of)\b/i, why: "causal claim" },
  // Temporal / directional CHANGE-OVER-TIME — the evidence is cross-sectional; no time
  // series is supplied. Targets literal change-over-time words only; aspirational verbs
  // like "improve"/"strengthen"/"an opportunity to grow engagement" are interpretation
  // (allowed). "grow/grew/growing" stays blocked as a trend verb.
  { re: /\b(?:increas(?:e|ed|es|ing)|decreas(?:e|ed|es|ing)|grew|grown|growing|declin(?:e|ed|es|ing)|ris(?:en|ing)|fell|fallen|falling|upward|downward|trend(?:s|ing|ed)?|over time|year[- ]on[- ]year|month[- ]on[- ]month)\b/i, why: "temporal/directional change-over-time claim (evidence is cross-sectional; no time series supplied)" },
  // Priority inferred from a response share.
  { re: /\b(?:top|main|highest|biggest|number[- ]?one|primary|key)\s+priorit/i, why: "priority claim inferred from response share (use 'most selected')" },
  // Unique people (uniqueness not proven) — 'responses'/'respondents' remain acceptable.
  { re: /\bunique\s+(?:respondents|people|users|individuals|fans|viewers)\b/i, why: "unique-respondent claim (uniqueness not proven)" },
  { re: /\b\d[\d,]*\s+(?:people|fans|viewers|individuals|persons)\b/i, why: "implies unique people (uniqueness not proven; say 'completed responses')" },
  { re: /\ball\s+fans\b/i, why: "over-generalisation ('all fans')" },
];

const norm = (s: unknown) => (typeof s === "string" ? s.trim() : "");
// Strip a leading label the model may echo from the evidence lines ("ref=…"/"id=…")
// and wrapping brackets.
const stripRef = (r: string) => r.replace(/^\s*(?:ref|id)\s*[:=]\s*/i, "").replace(/^\[+|\]+$/g, "").trim();

// ── Internal-ref leakage guard (user-facing prose must never expose evidence ids) ──
// Evidence refs are for governance, not prose. The model is TOLD to keep ids out of the
// text, but obedience is not a guarantee — so we deterministically STRIP any ref token
// from user-facing prose (headline/summary/explanation). The governed refs are persisted
// separately in evidenceRefs. containsInlineRef is exposed for tests.
// The full family of ways an evidence id can leak into prose. Order matters: strip the
// most specific (labelled arrays) before the loose (bare arrays / quoted / parenthesised).
const REF_EVIDENCEREFS = /\(?\s*"?evidence[_ ]?refs"?\s*[:=]\s*\[[^\]]*\]\s*\)?/gi;                    // (evidenceRefs: ["e1","e2"]) / "evidenceRefs":[...]
const REF_ARRAY = /\[\s*(?:"|')?e\d+(?:"|')?(?:\s*,\s*(?:"|')?e\d+(?:"|')?)*\s*\]/gi;                 // ["e1", "e2"] / [e1,e2]
const REF_TOKEN = /\(?\s*(?:id|ref)s?\s*[:=]\s*(?:"|')?e\d+(?:"|')?(?:\s*,\s*(?:(?:id|ref)s?\s*[:=]\s*)?(?:"|')?e\d+(?:"|')?)*\s*\)?/gi; // (id=e37), refs=e4, ref: "e1"
const REF_PAREN = /\(\s*(?:"|')?e\d+(?:"|')?(?:\s*,\s*(?:"|')?e\d+(?:"|')?)*\s*\)/gi;                 // (e37), (e37, e42), ("e1")
const REF_QUOTED = /(?:"|')e\d+(?:"|')/gi;                                                            // bare "e37" left in prose
const REF_CANON = /\b(?:study|survey)#[^\s)|]+(?:\|[^\s)]+)*/gi;                                       // study#/survey#..|q#..|opt#..
export function stripInlineRefs(text: string): string {
  return text
    .replace(REF_EVIDENCEREFS, "")
    .replace(REF_ARRAY, "")
    .replace(REF_TOKEN, "")
    .replace(REF_PAREN, "")
    .replace(REF_QUOTED, "")
    .replace(REF_CANON, "")
    .replace(/\(\s*[;,]?\s*\)/g, "")   // orphan empty parens left behind
    .replace(/\[\s*\]/g, "")           // orphan empty brackets
    .replace(/\s+([.,;:)])/g, "$1")   // tidy space before punctuation
    .replace(/\(\s+/g, "(")
    .replace(/\s{2,}/g, " ")
    .trim();
}
export function containsInlineRef(text: string): boolean {
  return /(?:id|ref)s?\s*[:=]\s*(?:"|')?e\d+/i.test(text)
    || /\[\s*(?:"|')?e\d+/.test(text)
    || /\(\s*(?:"|')?e\d+\b/.test(text)
    || /(?:"|')e\d+(?:"|')/.test(text)
    || /\b(?:study|survey)#/i.test(text);
}

// ── Semantic safety for grouped derived shares (Part 10) ──────────────────────
// Derived arithmetic PROVES THE CALCULATION; it does NOT prove a sentiment label. When a
// proposal/narrative cites a GROUPED share (two-most-selected combined %), it must not
// restate that share as approval/positive sentiment ("64.6% see FedEx positively"). This
// is deterministic and SCOPED — it fires only when a grouped-share ref is actually cited,
// not as a global banned-word list. Neutral, factual descriptions pass.
const SHARE_AS_SENTIMENT = /\b(?:positiv\w*|favou?rabl\w*|approv\w*|endors\w*|good sponsor|positive sentiment|support (?:the|for the) sponsorship)/i;
export function groupedShareSemanticReasons(text: string, citesGroupedShare: boolean): string[] {
  if (!citesGroupedShare) return [];
  return SHARE_AS_SENTIMENT.test(text)
    ? ["a grouped selection share is stated as a sentiment/approval verdict — the share proves the calculation, not sentiment (describe it factually or cite the constituent options)"]
    : [];
}

// Distinctive tokens (≥4 letters) of an evidence/derived label — for the grounding check.
const labelTokens = (s: string): string[] => (s.toLowerCase().match(/[a-z]{4,}/g) ?? []);

// ── Cross-question comparison safety (Part 6) ─────────────────────────────────
// Two percentages from DIFFERENT questions are NOT the same measure — their numeric
// magnitude is not comparable. So a proposal/narrative that cites base/derived evidence
// spanning ≥2 DISTINCT canonical questions must not describe a numeric "gap"/"difference"/
// "higher/lower"/"exceeds"/"outpaces"/"X pp higher" between them. This is deterministic and
// scoped: it fires only on cross-question NUMERIC-magnitude language. A cross-question
// SYNTHESIS that connects the MEANING of the measures (no magnitude comparison) is allowed,
// and a within-question comparison (one question, across surveys) is unaffected. Bare
// "vs"/"versus" is deliberately NOT matched — a "tension" headline ("visibility vs relevance")
// is legitimate; only explicit magnitude comparisons are caught.
const CROSS_Q_MAGNITUDE = /\b(?:gap between|difference between|differ(?:s|ence)? (?:from|between)|higher than|lower than|greater than|less than|more than|fewer than|outpaces?|outstrips?|exceeds?|trails?|lags? behind|compared (?:to|with)|relative to|\d[\d.]*\s*(?:percentage points?|pp|%)\s*(?:higher|lower|more|less|greater|above|below|apart))\b/i;
export function crossQuestionComparisonReasons(text: string, distinctCitedQuestions: number): string[] {
  if (distinctCitedQuestions < 2) return [];
  return CROSS_Q_MAGNITUDE.test(text)
    ? ["compares the numeric magnitude of measures from different questions — different questions are not the same measure (connect their meaning, not their percentages)"]
    : [];
}
// ── Respondent-level correlation safety (absolute V1/V2 boundary) ─────────────
// Aggregate distributions CANNOT establish that the SAME respondents hold two
// attitudes ("those who answered X to Q1 were more likely to answer Y to Q2",
// "the same fans preferred both", "A correlates with B"). Until governed cross-tab
// analysis over respondent vectors exists, any such claim is rejected. Deliberately
// targets the respondent-linkage STRUCTURE, not legitimate aggregate comparisons
// (e.g. "more respondents chose experiences than visibility" stays allowed).
const RESPONDENT_CORRELATION: RegExp[] = [
  // "those/respondents/people/fans who … [more/less likely | also chose/… | tend to]"
  /\b(?:those|respondents|people|fans|users|viewers)\s+who\b[^.?!]{0,90}\b(?:(?:more|less)\s+likely|also\s+(?:chose|selected|answered|said|preferred|felt|reported|picked|wanted|tended|were|are|had|showed)|tend(?:ed)?\s+to)\b/i,
  /\bthe same (?:respondents|people|fans|users|group)\b[^.?!]{0,90}\b(?:also|both|were|held|preferred|chose|felt|tend)\b/i,
  /\bcorrelat(?:e|es|ed|ion|ing)\b/i,
];
export function respondentCorrelationReasons(text: string): string[] {
  return RESPONDENT_CORRELATION.some((re) => re.test(text))
    ? ["respondent-level correlation/co-occurrence claim — aggregate distributions cannot establish that the same respondents hold two attitudes (prohibited until governed respondent-vector analysis exists)"]
    : [];
}

const bannedReasons = (text: string): string[] => [...BANNED_PATTERNS.filter((b) => b.re.test(text)).map((b) => b.why), ...respondentCorrelationReasons(text)];
/** Exposed for the staged Stage-1 validator — same firewall, one source of truth. */
export const bannedLanguageReasons = (text: string): string[] => bannedReasons(text);

/** Tolerant citation resolver → canonical full ref, or null. Accepts the short id shown
 *  in the prompt ("e1"…"eN"), the exact full ref, or a full ref with the "study#<id>|"
 *  prefix dropped (a common model slip with long UUID refs). Never fabricates a match. */
export function makeRefResolver(citable: readonly { ref: string }[]): (raw: unknown) => string | null {
  const byFull = new Map(citable.map((e) => [e.ref, e.ref]));
  const byShort = new Map(citable.map((e, i) => [`e${i + 1}`, e.ref]));
  const suffix = (ref: string) => ref.replace(/^(?:study|survey)#[^|]*\|/, "");
  const bySuffix = new Map(citable.map((e) => [suffix(e.ref), e.ref]));
  return (raw: unknown) => {
    const r = stripRef(norm(raw));
    if (!r) return null;
    return byFull.get(r) ?? byShort.get(r.toLowerCase()) ?? bySuffix.get(suffix(r)) ?? null;
  };
}

/**
 * Validate raw AI proposals against the supplied evidence set + language rules.
 * Rejects (never repairs by guessing): unknown/absent refs, wrong ref counts per
 * type, non-comparable comparisons, banned overclaim language, malformed content.
 * Every returned proposal cites ONLY refs that were supplied.
 */
export function validateProposals(
  raw: unknown,
  evidence: EvidenceItem[],
  derived: readonly { ref: string; kind?: string; label?: string; canonicalQuestionKey?: string }[] = [],
): ValidationResult {
  const allowed = new Map(evidence.map((e) => [e.ref, e])); // BASE only — for the comparison firewall
  const resolve = makeRefResolver([...evidence, ...derived]); // base + derived are both citable
  const groupedRefs = new Set(derived.filter((d) => d.kind === "grouped_share").map((d) => d.ref));
  const derivedRefs = new Set(derived.map((d) => d.ref));
  // ref → distinctive label tokens (for the implication grounding check).
  const labelByRef = new Map<string, string>([
    ...evidence.map((e) => [e.ref, `${e.question} ${e.optionLabel}`] as [string, string]),
    ...derived.map((d) => [d.ref, d.label ?? ""] as [string, string]),
  ]);
  // ref → canonical question (for the cross-question comparison guard).
  const qkByRef = new Map<string, string>([
    ...evidence.map((e) => [e.ref, e.canonicalQuestionKey] as [string, string]),
    ...derived.map((d) => [d.ref, d.canonicalQuestionKey ?? `derived:${d.ref}`] as [string, string]),
  ]);
  const list: unknown[] = Array.isArray(raw) ? raw : Array.isArray((raw as { proposals?: unknown[] })?.proposals) ? (raw as { proposals: unknown[] }).proposals : [];
  const valid: StudyAnalysisProposal[] = [];
  const rejected: RejectedProposal[] = [];

  for (const item of list) {
    const p = (item ?? {}) as Record<string, unknown>;
    const reasons: string[] = [];
    const kind = norm(p.type).toLowerCase() as ArtifactKind;
    const priority: ProposalPriority = norm(p.priority).toLowerCase() === "key" ? "key" : "supporting"; // presentation only; default supporting
    // Strip any leaked evidence-id token from user-facing prose (governance ≠ prose).
    const headline = stripInlineRefs(norm(p.headline));
    const explanation = stripInlineRefs(norm(p.explanation));
    const rawRefs = Array.isArray(p.evidenceRefs) ? p.evidenceRefs.map(norm).filter(Boolean) : [];

    if (!ARTIFACT_KINDS.includes(kind)) reasons.push(`invalid type "${norm(p.type)}"`);
    if (!headline) reasons.push("missing headline");
    if (headline.length > HEADLINE_MAX) reasons.push(`headline too long (${headline.length}>${HEADLINE_MAX})`);
    if (!explanation) reasons.push("missing explanation");
    if (explanation.length > EXPLANATION_MAX) reasons.push(`explanation too long (${explanation.length}>${EXPLANATION_MAX})`);

    // Banned overclaim language (headline + explanation).
    reasons.push(...bannedReasons(`${headline}\n${explanation}`));

    // Resolve each citation (short id / full ref / prefix-dropped) to a canonical ref.
    const unknown = rawRefs.filter((r) => !resolve(r));
    if (unknown.length) reasons.push(`unknown evidence ref(s): ${unknown.join(", ")}`);
    const known = [...new Set(rawRefs.map(resolve).filter((r): r is string => !!r))];

    // Salvage a mislabeled single-evidence higher-order artifact: a multi-evidence kind
    // (comparison/pattern/tension/synthesis) citing only ONE valid ref is really an
    // observation — reclassify rather than reject. The evidence firewall is unaffected
    // (the ref still validated); only the analytical label changes.
    let effectiveKind: ArtifactKind = (MULTI_EVIDENCE_KINDS.has(kind) && known.length === 1) ? "observation" : kind;

    // A "comparison" is the ONLY type bound by the directly-comparable firewall. But the
    // analyst often means a cross-survey DIFFERENCE it has (correctly) expressed by citing a
    // governed derived SPREAD/CONSISTENCY fact — that is a legitimate governed observation,
    // not a firewall violation. So: only apply the firewall to a comparison built from BASE
    // survey figures; a comparison whose evidence includes a derived fact (and isn't a
    // valid base-survey comparison) is reclassified to observation — the avenue is PRESERVED,
    // and the derived fact is itself deterministic and governed.
    if (effectiveKind === "comparison") {
      const items = known.map((r) => allowed.get(r)).filter((e): e is EvidenceItem => !!e);
      const keys = new Set(items.map((e) => e.canonicalQuestionKey));
      const nonCombinable = items.some((e) => e.comparability !== "combined");
      const surveys = new Set(items.filter((e) => e.scope === "survey").map((e) => e.surveyId));
      const isValidBaseComparison = known.length >= 2 && items.length >= 2 && keys.size === 1 && !nonCombinable && surveys.size >= 2;
      if (isValidBaseComparison) {
        // genuine governed base-survey comparison — keep as comparison
      } else if (known.some((r) => derivedRefs.has(r))) {
        effectiveKind = "observation"; // cross-survey difference via a governed derived fact — preserve as an observation
      } else {
        // genuine firewall violation — a base comparison that is not directly comparable
        if (known.length < 2) reasons.push("comparison needs ≥2 evidence refs");
        if (keys.size !== 1) reasons.push("comparison must stay within one comparable question");
        if (nonCombinable) reasons.push("comparison cites non-directly-comparable evidence");
        if (surveys.size < 2) reasons.push("comparison must contrast ≥2 source Surveys");
      }
    }

    // Per-kind ref-count rules.
    if ((effectiveKind === "observation" || effectiveKind === "implication") && known.length < 1) reasons.push(`${effectiveKind} needs ≥1 evidence ref`);
    if ((effectiveKind === "synthesis" || effectiveKind === "pattern" || effectiveKind === "tension") && known.length < 2) reasons.push(`${effectiveKind} needs ≥2 evidence refs`);

    // Semantic safety: a grouped share must not be restated as sentiment/approval.
    reasons.push(...groupedShareSemanticReasons(`${headline}\n${explanation}`, known.some((r) => groupedRefs.has(r))));

    // Cross-question safety: percentages from different questions are not comparable magnitudes.
    const distinctQuestions = new Set(known.map((r) => qkByRef.get(r)).filter(Boolean)).size;
    reasons.push(...crossQuestionComparisonReasons(`${headline}\n${explanation}`, distinctQuestions));

    // Grounding: an implication must genuinely discuss the evidence it cites (not generic
    // marketing advice that merely name-drops refs). Reject when its prose shares NO
    // distinctive token with any cited evidence/derived label.
    if (effectiveKind === "implication" && known.length >= 1) {
      const proseTokens = new Set(labelTokens(`${headline} ${explanation}`));
      const grounded = known.some((r) => labelTokens(labelByRef.get(r) ?? "").some((w) => proseTokens.has(w)));
      if (!grounded) reasons.push("implication is not grounded in the cited evidence (reads as generic advice)");
    }

    if (reasons.length) rejected.push({ proposal: { type: ARTIFACT_KINDS.includes(effectiveKind) ? storedTypeOf(effectiveKind) : "observation", displayType: kind, priority, headline, explanation, evidenceRefs: rawRefs }, reasons });
    else valid.push({ type: storedTypeOf(effectiveKind), displayType: effectiveKind, priority, headline, explanation, evidenceRefs: known });
  }

  // Deterministic redundancy control — drop genuine duplicates and near-identical
  // RESTATEMENTS of the same avenue (see dedupeProposals). We do NOT dedupe on shared
  // evidence: two DISTINCT interpretations may cite overlapping evidence and both survive.
  const { kept, dropped } = dedupeProposals(valid);
  for (const d of dropped) rejected.push({ proposal: d, reasons: ["near-duplicate of an earlier proposal (same avenue restated)"] });
  return { valid: kept, rejected };
}

// ── Redundancy control (pure, tested, reused by the multi-pass union) ─────────
// Removes exact duplicates AND near-identical headline RESTATEMENTS of the same avenue,
// while PRESERVING distinct interpretations (even when they share evidence). Similarity is
// headline content-word Jaccard — deliberately conservative (high threshold) so two genuinely
// different reads are never collapsed; shared evidence is NOT a dedupe signal.
const DEDUPE_STOPWORDS = new Set(["the", "and", "for", "with", "from", "across", "between", "their", "into", "over", "than", "that", "this", "these", "those", "are", "was", "were", "has", "have", "not", "but", "its", "our", "your", "them", "they", "also", "more", "most", "some", "such", "still", "yet", "while", "which", "when", "where", "what", "how", "who", "whom", "onto", "upon", "about", "amid", "among"]);
const headlineTokens = (h: string): Set<string> => new Set((h.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !DEDUPE_STOPWORDS.has(w)));
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
const NEAR_DUP_JACCARD = 0.7; // ≥ this content-word overlap = a restatement of the same avenue

export function dedupeProposals(proposals: StudyAnalysisProposal[]): { kept: StudyAnalysisProposal[]; dropped: StudyAnalysisProposal[] } {
  const kept: StudyAnalysisProposal[] = [];
  const keptTokens: Set<string>[] = [];
  const dropped: StudyAnalysisProposal[] = [];
  for (const p of proposals) {
    const toks = headlineTokens(p.headline);
    const exact = p.headline.toLowerCase().replace(/\s+/g, " ").trim();
    const isDup = kept.some((k, i) => k.headline.toLowerCase().replace(/\s+/g, " ").trim() === exact || jaccard(keptTokens[i], toks) >= NEAR_DUP_JACCARD);
    if (isDup) { dropped.push(p); continue; }
    kept.push(p); keptTokens.push(toks);
  }
  return { kept, dropped };
}

// ── Study narrative ("What the research says") ───────────────────────────────
// The AI's overall interpretation of the Study against its objective — one headline +
// summary, grounded in cited evidence. Same firewall as proposals: every ref must
// resolve, and the same banned-language guards apply. It is NOT a Finding; it's the
// Study-level synthesis shown above the proposal cards.
export type StudyNarrative = { headline: string; summary: string; evidenceRefs: string[] };
export type NarrativeResult = { narrative: StudyNarrative | null; rejected: { reasons: string[] } | null };

const NARRATIVE_HEADLINE_MAX = 240; // a verdict sentence, longer than a proposal headline
const NARRATIVE_SUMMARY_MAX = 1600;

/** Validate the model's narrative. Returns null (with reasons) when absent/invalid —
 *  a run stays valid without a narrative; the UI simply shows none. */
export function validateNarrative(raw: unknown, evidence: EvidenceItem[], derived: readonly { ref: string; kind?: string; canonicalQuestionKey?: string }[] = []): NarrativeResult {
  const n = ((raw as { narrative?: unknown })?.narrative ?? null) as Record<string, unknown> | null;
  if (!n || typeof n !== "object") return { narrative: null, rejected: null };
  const resolve = makeRefResolver([...evidence, ...derived]);
  const groupedRefs = new Set(derived.filter((d) => d.kind === "grouped_share").map((d) => d.ref));
  const qkByRef = new Map<string, string>([
    ...evidence.map((e) => [e.ref, e.canonicalQuestionKey] as [string, string]),
    ...derived.map((d) => [d.ref, d.canonicalQuestionKey ?? `derived:${d.ref}`] as [string, string]),
  ]);
  // User-facing prose must never expose evidence ids — strip deterministically.
  const headline = stripInlineRefs(norm(n.headline));
  const summary = stripInlineRefs(norm(n.summary));
  const rawRefs = Array.isArray(n.evidenceRefs) ? n.evidenceRefs.map(norm).filter(Boolean) : [];
  const reasons: string[] = [];
  if (!headline) reasons.push("missing narrative headline");
  if (headline.length > NARRATIVE_HEADLINE_MAX) reasons.push("narrative headline too long");
  if (!summary) reasons.push("missing narrative summary");
  if (summary.length > NARRATIVE_SUMMARY_MAX) reasons.push("narrative summary too long");
  reasons.push(...bannedReasons(`${headline}\n${summary}`));
  const unknown = rawRefs.filter((r) => !resolve(r));
  if (unknown.length) reasons.push(`unknown narrative evidence ref(s): ${unknown.join(", ")}`);
  const known = [...new Set(rawRefs.map(resolve).filter((r): r is string => !!r))];
  if (known.length < 1) reasons.push("narrative needs ≥1 evidence ref");
  // Grouped share must not be restated as sentiment/approval in the executive narrative.
  reasons.push(...groupedShareSemanticReasons(`${headline}\n${summary}`, known.some((r) => groupedRefs.has(r))));
  // Cross-question percentages are not comparable magnitudes.
  const distinctQuestions = new Set(known.map((r) => qkByRef.get(r)).filter(Boolean)).size;
  reasons.push(...crossQuestionComparisonReasons(`${headline}\n${summary}`, distinctQuestions));
  if (reasons.length) return { narrative: null, rejected: { reasons } };
  return { narrative: { headline, summary, evidenceRefs: known }, rejected: null };
}

// ── Themes (Level 3 — organisation over governed analytical avenues) ──────────
// A theme ORGANISES already-governed proposals into a coherent analytical conclusion. It
// is NOT governance: it never makes evidence more valid, never lets an avenue survive that
// governance rejected, never replaces Findings. Every theme is traceable theme → proposals
// → governed evidenceRefs. The model groups proposals (by index) and titles/interprets the
// grouping; the server computes the theme's evidenceRefs deterministically (union of member
// proposals' refs) — the model never supplies a theme's refs. Same prose firewall as
// proposals/narrative (strip ids, banned language, grouped-share + cross-question guards).
export type ThemeImportance = "primary" | "secondary";
export type StudyTheme = {
  id: string;                 // server-assigned (t1, t2, …)
  title: string;              // an analytical CONCLUSION, not a category label
  interpretation: string;     // why these avenues belong together + their combined meaning
  proposalIndexes: number[];  // 0-based into the validated proposal list (service maps → ids)
  evidenceRefs: string[];     // server-computed union of member proposals' governed refs
  importance: ThemeImportance;// presentation only
  relationToObjective: string;// why this matters to the Study objective
};
export type ThemeValidation = { themes: StudyTheme[]; rejected: { theme: Partial<StudyTheme>; reasons: string[] }[] };

const THEME_TITLE_MAX = 200;
const THEME_TEXT_MAX = 900;

/** Parse a model proposal reference (1-based number, "P3", or "3") to a 0-based index. */
function parseProposalIndex(raw: unknown, count: number): number | null {
  const s = typeof raw === "number" ? String(raw) : norm(raw);
  const m = s.match(/(\d+)/);
  if (!m) return null;
  const oneBased = parseInt(m[1], 10);
  const idx = oneBased - 1;
  return idx >= 0 && idx < count ? idx : null;
}

/**
 * Validate model-proposed themes against the VALIDATED proposals. Themes reference proposals
 * by index; unknown indexes are dropped; a theme with no valid member is rejected (graceful —
 * it is skipped, never shown unsupported). evidenceRefs are computed by the SERVER (union of
 * member proposals' refs), never taken from the model. Prose is stripped of ids and passes the
 * same banned-language / grouped-share / cross-question guards.
 */
export function validateThemes(
  raw: unknown,
  proposals: readonly { evidenceRefs: readonly string[] }[],
  evidence: EvidenceItem[] = [],
  derived: readonly { ref: string; kind?: string; canonicalQuestionKey?: string }[] = [],
): ThemeValidation {
  const groupedRefs = new Set(derived.filter((d) => d.kind === "grouped_share").map((d) => d.ref));
  const qkByRef = new Map<string, string>([
    ...evidence.map((e) => [e.ref, e.canonicalQuestionKey] as [string, string]),
    ...derived.map((d) => [d.ref, d.canonicalQuestionKey ?? `derived:${d.ref}`] as [string, string]),
  ]);
  const list: unknown[] = Array.isArray((raw as { themes?: unknown[] })?.themes) ? (raw as { themes: unknown[] }).themes : Array.isArray(raw) ? raw : [];
  const themes: StudyTheme[] = [];
  const rejected: { theme: Partial<StudyTheme>; reasons: string[] }[] = [];

  for (const item of list) {
    const t = (item ?? {}) as Record<string, unknown>;
    const reasons: string[] = [];
    const title = stripInlineRefs(norm(t.title));
    const interpretation = stripInlineRefs(norm(t.interpretation));
    const relationToObjective = stripInlineRefs(norm(t.relationToObjective ?? t.relation_to_objective));
    const importance: ThemeImportance = norm(t.importance).toLowerCase() === "primary" ? "primary" : "secondary";
    const rawRefs = Array.isArray(t.proposals) ? t.proposals : Array.isArray(t.proposalIds) ? t.proposalIds : Array.isArray(t.proposalIndexes) ? t.proposalIndexes : [];
    const indexes = [...new Set(rawRefs.map((r) => parseProposalIndex(r, proposals.length)).filter((i): i is number => i !== null))];

    if (!title) reasons.push("missing theme title");
    if (title.length > THEME_TITLE_MAX) reasons.push("theme title too long");
    if (!interpretation) reasons.push("missing theme interpretation");
    if (interpretation.length > THEME_TEXT_MAX) reasons.push("theme interpretation too long");
    if (relationToObjective.length > THEME_TEXT_MAX) reasons.push("theme relation-to-objective too long");
    reasons.push(...bannedReasons(`${title}\n${interpretation}\n${relationToObjective}`));
    if (indexes.length < 1) reasons.push("theme has no valid supporting proposals");

    // Server-computed evidence union (deterministic; never from the model).
    const evidenceRefs = [...new Set(indexes.flatMap((i) => [...proposals[i].evidenceRefs]))];
    // Same organisational-prose firewall as narrative/proposals.
    reasons.push(...groupedShareSemanticReasons(`${title}\n${interpretation}`, evidenceRefs.some((r) => groupedRefs.has(r))));
    const distinctQuestions = new Set(evidenceRefs.map((r) => qkByRef.get(r)).filter(Boolean)).size;
    reasons.push(...crossQuestionComparisonReasons(`${title}\n${interpretation}`, distinctQuestions));

    if (reasons.length) { rejected.push({ theme: { title, interpretation, proposalIndexes: indexes, importance, relationToObjective }, reasons }); continue; }
    themes.push({ id: `t${themes.length + 1}`, title, interpretation, proposalIndexes: indexes, evidenceRefs, importance, relationToObjective });
  }
  return { themes, rejected };
}
