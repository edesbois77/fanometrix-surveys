// Derived assessment: independence, evidence strength and confidence, computed
// from a claim's grounds and nothing else (docs/intelligence-model.md §4 Layer 4).
//
// PURE. No I/O, no model call, no framework. That is not a style preference: it
// is Principle 18 (every derived value is recomputable) and Principle 10
// (confidence is derived by a process independent of the one that formed the
// claim). Nothing that writes a claim is permitted to grade it, and the cheapest
// way to guarantee that is for the grader to be a function that cannot see the
// writer.
//
// Two things are computed here that are routinely collapsed into one, and the
// distinction is the point:
//   EVIDENCE STRENGTH  how good the grounds are.     A property of the evidence.
//   CONFIDENCE         how sure we are of the claim. A property of the inference.
// Strong evidence can support a claim weakly (a survey of 4,000 people tells you
// very little about causation), and thin evidence can support a narrow claim
// decisively. Collapsing them is how a platform ends up confident because it has
// a lot of data rather than because the data answers the question.
import {
  type Citation, type ContributionKind, type AssertionType, type ConfidenceLevel,
  type EvidenceStrengthLevel, type AssessmentFactor,
  CONTRIBUTION_LABEL, ASSERTION_LABEL, CARRIES_WEIGHT, isAdmissible, assertionDemand,
} from "@/lib/analysis/types";
import { hasNativeKind, combinationViolations, type CombinationViolation } from "@/lib/analysis/matrix";

// ── Independence ─────────────────────────────────────────────────────────────

export type Independence = {
  /** Independent observations that establish or qualify the claim. */
  supporting: number;
  /** Independent observations that point the other way. */
  contesting: number;
  /** Independent observations overall. */
  total: number;
  /** Admissible, weight-carrying citations. Kept alongside `total` precisely so
   *  the gap between the two is visible in both directions: 40 items standing on
   *  2 observations is a thinner base than the item count suggests, and one
   *  survey statistic standing on 400 responses is a broader one. */
  items: number;
};

/** How many genuinely independent observations stand behind a claim, as distinct
 *  from how many items. Repetition is not agreement and distribution is not
 *  corroboration: fifty carriers of one wire story are one observation.
 *
 *  Observations are summed across DISTINCT units, never across items, so two
 *  statistics from one survey contribute that survey's responses once rather
 *  than twice. Where citations disagree about a unit's size the largest is
 *  taken, since they are describing the same pool. */
export function independentLines(citations: Citation[]): Independence {
  const counted = citations.filter(c => isAdmissible(c) && CARRIES_WEIGHT.has(c.stance));
  const supporting = new Map<string, number>();
  const contesting = new Map<string, number>();
  for (const c of counted) {
    const into = c.stance === "contests" ? contesting : supporting;
    const size = Math.max(1, Math.floor(c.observations));
    into.set(c.observationKey, Math.max(into.get(c.observationKey) ?? 0, size));
  }
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  // A unit that both supports and contests is counted on each side, because it
  // genuinely does both: a survey whose two questions disagree is evidence
  // pointing both ways, not evidence cancelling itself out.
  return {
    supporting: sum(supporting),
    contesting: sum(contesting),
    total: sum(supporting) + sum(contesting),
    items: counted.length,
  };
}

/** The distinct kinds of knowledge behind a claim. Diversity of KIND, not of
 *  source: two publications and a wire agency are three sources supplying one
 *  kind, which is not triangulation. */
export function contributionKinds(citations: Citation[]): ContributionKind[] {
  const seen = new Set<ContributionKind>();
  for (const c of citations) {
    if (isAdmissible(c) && CARRIES_WEIGHT.has(c.stance)) seen.add(c.contribution);
  }
  return [...seen].sort();
}

// ── Evidence strength: how good are the grounds ──────────────────────────────

export type EvidenceStrength = {
  level: EvidenceStrengthLevel;
  score: number;                  // 0 to 6, retained so confidence can build on it
  rationale: string;
  factors: AssessmentFactor[];
  independence: Independence;
  kinds: ContributionKind[];
  /** Every supporting citation was admitted only with limits. Computed here
   *  because the grounds are already in hand, and consumed by confidence, where
   *  compatibility-matrix §6.2 caps it. */
  allWithLimits: boolean;
};

const meanWeight = (citations: Citation[]): number | null => {
  const ws = citations.map(c => c.weight).filter((w): w is number => typeof w === "number");
  return ws.length ? ws.reduce((a, b) => a + b, 0) / ws.length : null;
};

/** Grade the GROUNDS. Deliberately blind to whether the claim is contested:
 *  a contradiction is a problem for the inference, not evidence that the
 *  evidence is poor. Both sides of a genuine disagreement can rest on strong
 *  grounds, and saying otherwise is how contradictions get averaged away. */
export function deriveEvidenceStrength(citations: Citation[]): EvidenceStrength {
  const admissible = citations.filter(c => isAdmissible(c) && CARRIES_WEIGHT.has(c.stance));
  const independence = independentLines(citations);
  const kinds = contributionKinds(citations);

  if (admissible.length === 0) {
    return {
      level: "limited", score: 0,
      rationale: "No admissible evidence stands behind this claim.",
      factors: [{ label: "No admissible evidence attached", state: "off" }],
      independence, kinds, allWithLimits: false,
    };
  }

  const carrying = admissible.filter(c => c.stance !== "contests");
  const avg = meanWeight(carrying);
  const onlyWithLimits = carrying.length > 0 && carrying.every(c => c.admissibility === "admissible_with_limits");

  const linePts = independence.supporting >= 3 ? 2 : independence.supporting === 2 ? 1 : 0;
  const weightPts = avg === null ? 0 : avg >= 0.7 ? 2 : avg >= 0.55 ? 1 : 0;
  const kindPts = kinds.length >= 3 ? 2 : kinds.length === 2 ? 1 : 0;
  // Evidence admitted only with limits cannot carry a claim on its own, so a
  // base made entirely of it is capped below whatever its volume suggests.
  const limitsPenalty = onlyWithLimits ? 1 : 0;

  const score = Math.max(0, linePts + weightPts + kindPts - limitsPenalty);
  const level: EvidenceStrengthLevel = score >= 4 ? "strong" : score >= 2 ? "moderate" : "limited";

  const factors: AssessmentFactor[] = [
    // Reads correctly in both directions, which is the point of separating the
    // two counts: "1 independent observation, across 50 pieces of evidence" is a
    // syndicated story, and "400 independent observations, across 1 piece of
    // evidence" is a survey. Neither is visible from an item count alone.
    { label: `${independence.supporting} independent observation${independence.supporting === 1 ? "" : "s"}, across ${independence.items} piece${independence.items === 1 ? "" : "s"} of evidence`, state: independence.supporting >= 2 ? "on" : "info" },
  ];
  if (avg !== null) factors.push({ label: `Average bearing on the claim: ${Math.round(avg * 100)}%`, state: "info" });
  factors.push(kinds.length >= 2
    ? { label: `Triangulated across ${kinds.length} kinds of evidence: ${kinds.map(k => CONTRIBUTION_LABEL[k]).join(", ")}`, state: "on" }
    : { label: `Rests on one kind of evidence: ${kinds.length ? CONTRIBUTION_LABEL[kinds[0]] : "none"}`, state: "off" });
  if (onlyWithLimits) factors.push({ label: "All supporting evidence was admitted only with limits", state: "off" });

  return {
    level, score, rationale: strengthRationale(independence, kinds, onlyWithLimits),
    factors, independence, kinds, allWithLimits: onlyWithLimits,
  };
}

function strengthRationale(ind: Independence, kinds: ContributionKind[], onlyWithLimits: boolean): string {
  const lines = ind.supporting === 1
    ? `A single independent observation supports this claim`
    : `${ind.supporting} independent observations support this claim`;
  const items = ind.items === ind.supporting ? "" : `, across ${ind.items} items`;
  const kind = kinds.length >= 2
    ? `, drawing on ${kinds.length} different kinds of evidence`
    : kinds.length === 1 ? `, all of one kind (${CONTRIBUTION_LABEL[kinds[0]]})` : "";
  const limits = onlyWithLimits ? ". None of it can carry the claim on its own" : "";
  return `${lines}${items}${kind}${limits}.`;
}

// ── Confidence: how sure are we of the claim ─────────────────────────────────

export type ConfidenceInput = {
  citations: Citation[];
  /** What KIND of claim is being made. A causal claim is a harder thing to
   *  establish than a descriptive one, and must be held to that. */
  assertion: AssertionType;
  /** Whether the candidate was actually tested against its full frame for
   *  evidence that would weaken or refute it (invariant 8). A claim nobody tried
   *  to refute is not the same as one that survived the attempt, and the model
   *  must be able to tell the difference. */
  disconfirmed: boolean;
  /** Absence claims only: how many admissible items were examined and found not
   *  to answer the need. An absence backed by a thorough search is a confident
   *  finding; an absence backed by no search is not a finding at all. */
  examined?: number;
};

export type Confidence = {
  level: ConfidenceLevel;
  rationale: string;
  factors: AssessmentFactor[];
  /** The bridge back to research: what would move this up. Empty when nothing
   *  short of different evidence would. */
  whatWouldRaiseIt: string[];
};

const MIN_EXAMINED_FOR_CONFIDENT_ABSENCE = 20;

export function deriveConfidence(input: ConfidenceInput): Confidence {
  if (input.assertion === "absence") return absenceConfidence(input);

  const strength = deriveEvidenceStrength(input.citations);
  const { independence, kinds } = strength;

  if (independence.items === 0) {
    return {
      level: "Low",
      rationale: "No admissible evidence stands behind this claim.",
      factors: [{ label: "No admissible evidence attached", state: "off" }],
      whatWouldRaiseIt: ["Evidence that can legitimately support a claim of this kind"],
    };
  }

  // Contestation is an INFERENCE problem, which is why it lands here and not in
  // strength. Evidence pointing both ways does not make the evidence bad; it
  // makes the conclusion less safe, and the honest response is a lower grade
  // rather than a quiet decision about which side to believe.
  const contested = independence.contesting > 0;
  const heavilyContested = independence.contesting >= independence.supporting;
  const contestPenalty = heavilyContested ? 3 : contested ? 1 : 0;

  // A claim nobody tried to refute is worth less than one that survived the
  // attempt, and a claim that survived is worth more than the grounds alone say.
  const disconfirmAdjust = !input.disconfirmed ? -1 : contested ? 0 : 1;

  // A claim supported by a kind BUILT for it is held to a lower bar than the same
  // claim scraped together from kinds working outside their home ground. Without
  // this relief a well-sampled survey measuring stated attitude, which is the
  // native instrument for a magnitude claim, would pay the same penalty as a
  // magnitude inferred from documented activity (compatibility-matrix §3).
  const native = hasNativeKind(input.assertion, kinds);
  const demand = Math.max(0, assertionDemand(input.assertion) - (native ? 1 : 0));
  const score = strength.score + disconfirmAdjust - contestPenalty - demand;

  let level: ConfidenceLevel = score >= 4 ? "High" : score >= 2 ? "Medium" : "Low";
  // A single line of evidence can never be High, however strong it looks. One
  // source agreeing with itself is not corroboration.
  if (independence.supporting <= 1 && level === "High") level = "Medium";

  // Combination rules cap rather than adjust, because they are prohibitions
  // rather than weightings: no volume of evidence that cannot carry a claim adds
  // up to evidence that can (compatibility-matrix §6).
  const violations = combinationViolations({ assertion: input.assertion, kinds, allWithLimits: strength.allWithLimits });
  for (const v of violations) {
    const cap: ConfidenceLevel = v.rule === "6.1" ? "Low" : "Medium";
    if (rank(level) > rank(cap)) level = cap;
  }

  return {
    level,
    rationale: confidenceRationale({ independence, contested, heavilyContested, disconfirmed: input.disconfirmed, assertion: input.assertion, native, violations }),
    factors: confidenceFactors({ strength, contested, heavilyContested, disconfirmed: input.disconfirmed, assertion: input.assertion, demand, violations }),
    whatWouldRaiseIt: whatWouldRaiseIt({ independence, kinds, contested, disconfirmed: input.disconfirmed, level, violations }),
  };
}

const rank = (l: ConfidenceLevel): number => (l === "High" ? 3 : l === "Medium" ? 2 : 1);

/** An absence claim is judged on the thoroughness of the search, never on the
 *  grounds, because there are none by definition. "We looked at 400 items and
 *  none of them answers this" is a confident finding. "We did not look" is not
 *  a finding at all. */
function absenceConfidence(input: ConfidenceInput): Confidence {
  const examined = input.examined ?? 0;
  const thorough = input.disconfirmed && examined >= MIN_EXAMINED_FOR_CONFIDENT_ABSENCE;
  const level: ConfidenceLevel = thorough ? "High" : examined > 0 ? "Medium" : "Low";

  return {
    level,
    rationale: examined > 0
      ? `${examined} admissible item${examined === 1 ? "" : "s"} were examined and none of them answers this question.`
      : "No admissible evidence has been examined against this question yet.",
    factors: [
      { label: `${examined} admissible item${examined === 1 ? "" : "s"} examined`, state: examined > 0 ? "info" : "off" },
      input.disconfirmed
        ? { label: "The available evidence was searched for an answer", state: "on" }
        : { label: "The available evidence has not been searched for an answer", state: "off" },
    ],
    whatWouldRaiseIt: thorough
      ? ["Collecting evidence of a kind that could answer this question"]
      : ["Examining the evidence already collected against this question"],
  };
}

function confidenceFactors(f: {
  strength: EvidenceStrength; contested: boolean; heavilyContested: boolean;
  disconfirmed: boolean; assertion: AssertionType; demand: number;
  violations: CombinationViolation[];
}): AssessmentFactor[] {
  const out: AssessmentFactor[] = [...f.strength.factors];

  out.push(f.heavilyContested
    ? { label: `Evidence points both ways, with ${f.strength.independence.contesting} observation${f.strength.independence.contesting === 1 ? "" : "s"} against`, state: "off" }
    : f.contested
      ? { label: `${f.strength.independence.contesting} independent observation${f.strength.independence.contesting === 1 ? "" : "s"} points the other way`, state: "off" }
      : { label: "No evidence found pointing the other way", state: "on" });

  out.push(f.disconfirmed
    ? { label: "Tested against evidence that would contradict it", state: "on" }
    : { label: "Not yet tested against evidence that would contradict it", state: "off" });

  if (f.demand >= 2) {
    out.push({ label: `This is ${ASSERTION_LABEL[f.assertion]}, which needs more than description to establish`, state: "info" });
  }
  // A capped claim must say so on the same surface that shows its grade,
  // otherwise the cap reads as an unexplained low score.
  for (const v of f.violations) out.push({ label: v.message, state: "off" });
  return out;
}

function confidenceRationale(f: {
  independence: Independence; contested: boolean; heavilyContested: boolean;
  disconfirmed: boolean; assertion: AssertionType; native: boolean;
  violations: CombinationViolation[];
}): string {
  const parts: string[] = [];
  parts.push(f.independence.supporting === 1
    ? "One independent observation supports this"
    : `${f.independence.supporting} independent observations support this`);

  if (f.heavilyContested) parts.push(`and as much evidence points the other way`);
  else if (f.contested) parts.push(`with ${f.independence.contesting} pointing the other way`);

  parts.push(f.disconfirmed
    ? "after testing for evidence that would contradict it"
    : "and it has not yet been tested for evidence that would contradict it");

  const demandNote = assertionDemand(f.assertion) >= 2
    ? ` This is ${ASSERTION_LABEL[f.assertion]}, which is held to a higher bar than a description of what was observed${f.native ? ", though the evidence behind it is of the kind built to establish it" : ""}.`
    : "";
  // The cap is the operative reason for the grade wherever one applies, so it
  // leads rather than trailing behind the arithmetic.
  const capNote = f.violations.length ? ` ${f.violations[0].message}` : "";

  return `${parts.join(", ")}.${demandNote}${capNote}`;
}

function whatWouldRaiseIt(f: {
  independence: Independence; kinds: ContributionKind[];
  contested: boolean; disconfirmed: boolean; level: ConfidenceLevel;
  violations: CombinationViolation[];
}): string[] {
  const out: string[] = [];
  if (f.level === "High") return out;
  // A capped claim leads with the cap, because everything else is beside the
  // point until the prohibition is cleared.
  if (f.violations.some(v => v.rule === "6.1")) out.push("Evidence of a different kind, since no single way of knowing can establish a claim of this sort");
  if (f.violations.some(v => v.rule === "6.2")) out.push("Evidence admitted without limits, which this claim currently has none of");
  if (!f.disconfirmed) out.push("Testing this claim against evidence that would contradict it");
  if (f.independence.supporting < 3) out.push("Corroboration from an independent observation");
  if (f.kinds.length < 2 && !f.violations.some(v => v.rule === "6.1")) out.push("A second kind of evidence, so the claim does not rest on one way of knowing");
  if (f.contested) out.push("Resolving, or bounding, the evidence that points the other way");
  return out;
}
