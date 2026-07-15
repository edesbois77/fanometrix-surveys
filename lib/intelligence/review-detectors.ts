// Shared, report-agnostic deterministic review-detector engine — the single
// home for the sentence-level "surface a passage a human should look at"
// checks, reused by every report's own Review Prompt layer (the Full
// Research Report's flagReviewConcerns and the Editorial Article's
// flagArticleReviewConcerns both build on scanProse below). Extracted here
// so those detectors are defined ONCE, not copied per report type.
//
// Philosophy, identical across every consumer: it ONLY detects and surfaces
// — it never rewrites, corrects, regenerates, blocks or stores anything. A
// flag means "look at this," never "this is wrong." Deterministic heuristics
// only (never an AI pass): lighter, predictable, incapable of hallucinating
// a concern that isn't literally in the text. It occasionally over-flags —
// correct for a review aid whose job is to draw the eye, not gate
// correctness. Pure and framework-free (no Supabase, no React), so it runs
// at render time directly from the report object a page already holds.

export type ReviewFlagCategory =
  | "unsupported_causation"
  | "invented_outcome"
  | "speculation"
  | "cross_transfer"
  | "claim_exceeds_evidence"
  | "false_contradiction"
  | "unsupported_premise";

export const REVIEW_FLAG_CATEGORY_LABEL: Record<ReviewFlagCategory, string> = {
  unsupported_causation:  "Possible unsupported cause",
  invented_outcome:       "Possible invented outcome",
  speculation:            "Possible speculation",
  cross_transfer:         "Possible cross-market / cross-theme transfer",
  claim_exceeds_evidence: "Claim may exceed cited evidence",
  false_contradiction:    "Possible false contradiction (different constructs)",
  unsupported_premise:    "Possible unsupported strategic premise",
};

export type ReviewFlag = {
  /** Which part of the report/article the passage is in — a theme name,
   * "Executive Summary", "Section 2: …", etc. */
  section: string;
  category: ReviewFlagCategory;
  /** The exact sentence (or clause) flagged, verbatim. */
  passage: string;
  /** One line: why this passage was surfaced for review. */
  why: string;
  /** Where the check can determine it: which findings the section cites, or
   * that a figure/claim traces to nothing cited. Omitted when not
   * determinable. */
  evidenceNote?: string;
};

// ── Patterns. Kept intentionally specific to the slippage shapes seen in
// real generations, not broad enough to flag every other sentence. ──
// Causal / evidential-link phrasing. Beyond the plain cause words, this
// also catches the softer "one finding stands for another" moves that let
// prose fuse separately-scoped findings into a single story without a hard
// causal verb — "linked to", "emblematic of", "symptomatic of", "aligns
// with the notion that". Deliberately over-inclusive (this is a
// surface-for-review aid, not a gate); "aligns with" is constrained to a
// following determiner so it fires on "aligns with the notion" but not on a
// bare "aligns with 2028".
const CAUSAL = /\b(because of|because|due to|driven by|as a result of|owing to|stems from|leads to|caused by|the reason (?:for|behind)|attributed to|explained by|a result of|reflects the|can be explained|linked to|emblematic of|symptomatic of|indicative of|a symptom of|associated with|connected to|aligns with (?:the|this|that|these|those|a|an))\b/i;
const OUTCOME = /\b(enhanc\w+|boost\w*|increas\w+|strengthen\w*|improv\w+|driv\w+|maximis\w+|maximiz\w+)\s+(?:its?\s+|their\s+|brand\s+)?(loyalty|affinity|engagement|awareness|perception|presence|sentiment|reputation|image|appeal)\b/i;
const SPECULATION = /\b(could include|may include|might include|could involve|may involve|might involve|such as (?:cultural|past|competitive|specific|economic|political|regional|demographic)|factors such as|possibly due to|perhaps because|this could (?:imply|suggest) that)\b/i;
// Candidate-cause NOUN classes — catches an unevidenced explanation named
// by its category ("cultural or economic factors", "past brand
// interactions") regardless of the verb that introduces it, which the
// phrase-specific SPECULATION pattern above misses. Kept conservative by
// only firing when a hedge/exploration cue sits in the same sentence, so a
// sentence stating an EVIDENCED cause ("economic factors drove the 12%
// decline") is not flagged, only a speculative one ("could involve
// exploring cultural or economic factors").
const CANDIDATE_CAUSE = /\b(cultural|economic|political|competitive|demographic|regional|social|historical|market-specific)\s+(factors|dynamics|differences|considerations|reasons|forces)\b|\bpast (?:brand )?(?:interactions|campaigns|experiences|associations)\b/i;
const HEDGE_NEAR_CAUSE = /\b(could|may|might|explor\w+|investigat\w+|potential\w*|possibl\w+|perhaps|consider\w+)\b/i;
const FILLER = /(^|[.!?]\s)(in conclusion\b|overall,|ultimately,)/i;
const CROSS_MARKET = /\b(strateg\w+ from other markets|a model for (?:other )?markets?|leverag\w+[^.]{0,40}\b(?:in|for|to)\s+(?:other markets?|another market)|appl\w+[^.]{0,40}\bto\s+(?:other markets?|another market)|offers? (?:a|an) (?:approach|model|avenue)[^.]{0,30}\b(?:other markets?|another market))/i;

// ── Construct-comparability: a possible FALSE contradiction. Mirrors the
// Executive Report's own construct detector (flagConstructComparability),
// applied at the sentence level to generated prose. The dominant detectable
// case: one sentence frames a subject-ATTITUDE measure (liking/disliking the
// brand itself) and an ACTIVITY-sentiment measure (its sponsorship /
// campaign / partnership) as opposing — a dichotomy, discrepancy,
// divergence, contradiction — when the two may simply measure different
// constructs that can both hold at once. Deliberately narrow: it fires only
// when a contradiction word AND both construct cues appear in the SAME
// sentence, so a legitimate strategic "tension between global image and
// local issues" (no attitude/activity construct pair) is left alone, and so
// is a genuine same-construct contradiction (two sponsorship figures, two
// brand-liking figures). The three regexes mirror the ER detector's
// vocabulary.
const CONTRADICTION_FRAMING = /\b(dichotom\w+|discrepanc\w+|divergen\w+|disconnect|paradox\w*|contradict\w+|mismatch|at odds|conflicting|opposing|incongru\w+|tension between)\b/i;
const SUBJECT_ATTITUDE = /\b(likes?|liking|dislikes?|dislik\w+|hate\w*|love\w*|prefer\w*|favou?rs?|favou?rable opinion|opinion of|attitude toward|personal (?:brand )?sentiment|brand sentiment|brand perception|brand dislike)\b/i;
const ACTIVITY_SENTIMENT = /\b(sponsorship|sponsor\w*|campaign\w*|marketing|advertis\w*|partnership\w*|activation\w*)\b/i;

/** True when a span of text contains a contradiction-framing word AND both
 * construct cues (an attitude-to-the-subject measure and an
 * activity-sentiment measure) — the signal that it may be framing two
 * different constructs as opposing. Used sentence-level inside scanProse,
 * and section-level by the Editorial Article review, where a section's
 * heading and body TOGETHER can frame a contradiction the sentence-level
 * scan would miss (the cues split across the heading and separate body
 * sentences). */
export function framesConstructContradiction(text: string): boolean {
  return CONTRADICTION_FRAMING.test(text) && SUBJECT_ATTITUDE.test(text) && ACTIVITY_SENTIMENT.test(text);
}

// ── Unsupported strategic premise / invented audience-or-market concept.
// A recommendation or direction leaning on a value, need, concern or market
// characteristic the evidence may never have measured — "resonate with
// local values and concerns", "content that speaks to their sense of
// community", "addressing the underlying anxieties of this market". A
// deterministic check cannot confirm whether the referenced value is in the
// evidence, so this surfaces the phrasing for the reviewer to check against
// a cited finding; it never asserts the premise is invented, only that it
// warrants confirmation. Centred on local/market/community characteristics
// (the observed failure shape) plus generic "underlying needs / what they
// care about", and deliberately NOT plain "their values" — that is often a
// genuinely measured attribute (e.g. a survey establishing an audience's
// stated priorities) and would over-flag.
const INVENTED_PREMISE = /\b(local values|local concerns|local culture|community values|cultural values|regional values|(?:resonate|align\w*|connect\w*|speak|tailor\w*|cater\w*)\s+(?:with|to)\s+(?:local|regional|community|cultural)[^.]{0,30}\b(?:values|concerns|needs|culture|identity|expectations|sensibilities)|sense of (?:community|belonging|local identity)|underlying (?:anxieties|needs|desires|motivations|concerns)|what (?:this audience|these fans|local fans|they)\s+(?:cares?\s+about|values?|wants?))\b/i;

/** Strips the model's own inline reference markers — bracketed finding
 * indices ("[6]", "[10, 13]") and composite quote/chart IDs
 * ("[document:…]", "[survey:…]") — before any scanning. They are citation
 * scaffolding, not prose: left in, they wreck sentence splitting and make
 * every number check fire on index digits. Applied to the passage shown to
 * the reviewer too, so flags read as clean prose. */
export function stripRefs(text: string): string {
  return text
    .replace(/\[(?:document|conversation_search|survey):[^\]]*\]/g, "")
    .replace(/\[\d+(?:\s*,\s*\d+)*\]/g, "")
    // Collapse a now-empty parenthetical the stripped citations left behind
    // (e.g. "full games ([6], [8])." → "full games (, )." → "full games.").
    .replace(/\(\s*[,;]*\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;])/g, "$1")
    .trim();
}

/** Splits prose into sentences for per-passage flagging. Fragments under
 * 25 chars are dropped — they are almost always split artifacts (e.g. a
 * date like "3.23.26" breaking into "23." / "26."), never a real claim. */
function sentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) ?? [])
    .map(s => s.trim())
    .filter(s => s.length >= 25);
}

/** Percentages only — the figure shape that actually matters for "a
 * statistic that may not trace to the evidence". Deliberately NOT bare
 * integers: those are dominated by tournament years (2026/2028), team
 * counts and market counts that are legitimate context and would drown the
 * signal in noise. */
function percentagesIn(text: string): string[] {
  return [...new Set(text.match(/\d+(?:\.\d+)?%/g) ?? [])];
}

/** The shared sentence-level scan. Appends a ReviewFlag to `out` for every
 * pattern a sentence trips. `citedIndicesLabel` is an optional note about
 * what the section cites; `fullPoolBlob` is the lower-cased evidence text a
 * cited percentage should be found in (a percentage present nowhere in it is
 * the "may be invented" signal). Report-agnostic: each caller decides what
 * prose to feed it and what its evidence pool is. */
export function scanProse(
  section: string,
  rawText: string,
  citedIndicesLabel: string | undefined,
  fullPoolBlob: string,
  out: ReviewFlag[]
) {
  const text = stripRefs(rawText);
  for (const s of sentences(text)) {
    if (CAUSAL.test(s)) {
      out.push({ section, category: "unsupported_causation", passage: s,
        why: "States a cause or explanation — confirm a cited finding actually establishes it.",
        evidenceNote: citedIndicesLabel });
    }
    if (OUTCOME.test(s)) {
      out.push({ section, category: "invented_outcome", passage: s,
        why: "Names a commercial outcome as a result — confirm a source actually measured it.",
        evidenceNote: citedIndicesLabel });
    }
    if (SPECULATION.test(s) || FILLER.test(s) || (CANDIDATE_CAUSE.test(s) && HEDGE_NEAR_CAUSE.test(s))) {
      out.push({ section, category: "speculation", passage: s,
        why: FILLER.test(s) ? "Closing/summarising filler phrase — check it adds no unsupported claim." : "Candidate causes or examples that may not be stated in the evidence." });
    }
    if (CROSS_MARKET.test(s)) {
      out.push({ section, category: "cross_transfer", passage: s,
        why: "May carry one market's evidence across to another market as a remedy or model." });
    }
    if (framesConstructContradiction(s)) {
      out.push({ section, category: "false_contradiction", passage: s,
        why: "Frames a measure of attitude toward the subject (e.g. liking/disliking the brand) and a measure of sentiment about an activity (e.g. its sponsorship) as opposing. Confirm both really measure the same construct and population before treating them as a contradiction — different constructs can both hold at once and should be presented as coexisting, not conflicting.",
        evidenceNote: citedIndicesLabel });
    }
    if (INVENTED_PREMISE.test(s)) {
      out.push({ section, category: "unsupported_premise", passage: s,
        why: "Leans on an audience value, need or market characteristic. Confirm a cited finding actually establishes it — if the evidence never measured it, this may be an invented premise the strategic direction rests on." });
    }
    // Only run the percentage-trace check when there is an evidence pool to
    // check against — a caller with no self-contained numeric evidence
    // passes an empty blob to skip it rather than flag every figure.
    if (fullPoolBlob) {
      const orphanPercents = percentagesIn(s).filter(p => !fullPoolBlob.includes(p.toLowerCase()));
      if (orphanPercents.length) {
        out.push({ section, category: "claim_exceeds_evidence", passage: s,
          why: `Percentage(s) ${orphanPercents.join(", ")} not found anywhere in the evidence pool — confirm the source.`,
          evidenceNote: citedIndicesLabel });
      }
    }
  }
}
