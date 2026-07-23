// The vocabulary the assessment layer reasons over (docs/intelligence-model.md
// §4). Deliberately STRUCTURAL: nothing in this file names a source type, a
// connector or a product. A survey statistic, a conversation, an article and
// whatever the fortieth source produces all arrive here as the same shape, and
// the only thing that distinguishes them is the contribution kind their source
// contract declares. That is Principle 8 made structural rather than remembered:
// adding a source must never require a change to how claims are assessed.
//
// Everything here is pure data. No I/O, no database, no framework.

/** The six kinds of knowledge a source may supply (docs/evidence-contribution.md
 *  §3). Each carries a prohibition no other kind carries, which is the whole
 *  reason there are six rather than twelve. A proposed seventh must carry a
 *  prohibition none of these do, or it is not earning its place. */
export type ContributionKind =
  | "elicited_perception"    // what people say when asked. Not what they did.
  | "unprompted_discourse"   // what people say unbidden. Not population magnitude.
  | "documented_activity"    // what verifiably happened. Not what anyone thought of it.
  | "interested_claim"       // what a party says about itself. Not that it is true.
  | "expert_judgement"       // a named professional's assessment. Not consensus.
  | "established_knowledge"; // prior research and benchmarks. Not that it holds here.

/** The kind of claim being made (docs/intelligence-model.md §4 Layer 3).
 *
 *  WORKING DEFAULT, and a known open decision (intelligence-model §12.1): the
 *  taxonomy is load-bearing and expected to be revised exactly once, after real
 *  use. It is versioned rather than assumed permanent (see ASSERTION_TAXONOMY_VERSION)
 *  so findings formed under an earlier vocabulary stay interpretable. */
export type AssertionType =
  | "descriptive"   // this is what is
  | "comparative"   // X relative to Y
  | "magnitude"     // how much, how many, what share
  | "temporal"      // changing over time
  | "causal"        // X because of Y
  | "predictive"    // X will happen
  | "absence";      // the evidence does not establish this

export const ASSERTION_TAXONOMY_VERSION = 1;

/** What a cited item does for a claim. A property of the RELATIONSHIP, not of
 *  the evidence: the same item legitimately establishes one claim, qualifies a
 *  second and contests a third, which is why stance can never live on the
 *  evidence item itself. */
export type CitationStance =
  | "establishes"  // carries the claim
  | "illustrates"  // shows the claim, adds no evidential weight
  | "qualifies"    // bounds the conditions under which the claim holds
  | "contests";    // points the other way

/** The verdict of projecting an information need through a source contract for
 *  an intended assertion type. A gate, not a recommendation (Principle 9). */
export type Admissibility =
  | "admissible"
  | "admissible_with_limits"  // may support, but cannot carry the claim alone
  | "inadmissible";           // excluded, with a reason, and retained

export type ConfidenceLevel = "High" | "Medium" | "Low";

/** Matches the vocabulary already rendered by Existing Intelligence
 *  (docs/existing-intelligence.md §4) so one word means one thing platform-wide. */
export type EvidenceStrengthLevel = "strong" | "moderate" | "limited";

/** One evidence item bound to one claim. The unit every derived assessment is
 *  computed from, and therefore the unit that makes every assessment
 *  recomputable (Principle 18). */
export type Citation = {
  stance: CitationStance;
  admissibility: Admissibility;
  contribution: ContributionKind;
  /** Opaque key identifying the INDEPENDENT LINE of evidence this item belongs
   *  to. Two citations sharing a key are one line, never two.
   *
   *  The producer decides what constitutes a line (a publisher, a survey
   *  instrument, a study, an author), and this layer only counts distinct keys,
   *  so it never learns about source types. This is the whole defence against
   *  the failure that has already shipped once: fifty syndications of one wire
   *  story reading as fifty corroborating sources (Principle: corroboration
   *  requires independence). */
  line: string;
  /** 0 to 1. How directly this item bears on THIS claim. Null where the
   *  producer could not judge it, which is treated as unknown rather than as
   *  zero, because absent judgement is not evidence of irrelevance. */
  weight: number | null;
};

/** One line of a derived assessment's breakdown, as the analyst and client see
 *  it. `state` drives tone: on = a strength present, off = a weakness or
 *  absence, info = a neutral measure. Shape preserved from the shipped
 *  confidence explainer so the existing object renderers keep working. */
export type AssessmentFactor = { label: string; state: "on" | "off" | "info" };

// ── Assertion demand ─────────────────────────────────────────────────────────
// How much a claim of this kind must be supported before it may be asserted
// confidently. This is the architecture paying for itself: the SAME grounds
// warrant a descriptive claim at High and a causal claim at Low, because a
// causal claim is a harder thing to establish. Without this, the platform's
// confidence tracks how much evidence there is and never what is being asked of
// it, which is how "fans discussed X" quietly becomes "X caused Y".
const ASSERTION_DEMAND: Record<AssertionType, number> = {
  descriptive: 0,
  comparative: 1,
  temporal:    1,
  magnitude:   2,
  causal:      3,
  predictive:  3,
  absence:     0,   // judged on the thoroughness of the search, not on grounds
};

export const assertionDemand = (t: AssertionType): number => ASSERTION_DEMAND[t];

/** Plain-language name for an assertion type, for the rare occasions the analyst
 *  surface must say one out loud (docs/intelligence-model.md §8: never named
 *  unless it is blocking something). */
export const ASSERTION_LABEL: Record<AssertionType, string> = {
  descriptive: "what is the case",
  comparative: "a comparison",
  magnitude:   "a measurement",
  temporal:    "a change over time",
  causal:      "a cause",
  predictive:  "a prediction",
  absence:     "an absence of evidence",
};

/** What each contribution kind is called where a person has to read it. */
export const CONTRIBUTION_LABEL: Record<ContributionKind, string> = {
  elicited_perception:  "asked opinion",
  unprompted_discourse: "unprompted discussion",
  documented_activity:  "documented activity",
  interested_claim:     "an interested party's claim",
  expert_judgement:     "expert judgement",
  established_knowledge: "established research",
};

/** Citations that carry evidential weight. `illustrates` deliberately does not:
 *  a vivid quote shows a claim, it does not support it, and counting it is how
 *  a finding ends up looking better evidenced than it is. */
export const CARRIES_WEIGHT: ReadonlySet<CitationStance> = new Set<CitationStance>([
  "establishes", "qualifies", "contests",
]);

/** Only admissible evidence may contribute to any derived value. Inadmissible
 *  citations are retained on the finding for the record and counted nowhere
 *  (invariant 7). */
export const isAdmissible = (c: Citation): boolean => c.admissibility !== "inadmissible";
