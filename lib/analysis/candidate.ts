// Assessment, ranking, and the Candidate Finding
// (docs/intelligence-model.md §5 ASSESSMENT, and the Finding Lifecycle Arc A).
//
// The last stage before a human sees anything. It grades each tested
// proposition, orders the rivals, and promotes the best-supported one to a
// CANDIDATE Finding, carrying its defeated rivals with it.
//
// Three things this file is careful not to do:
//   - It does not decide. Ranking is DERIVED from the assessment, and the
//     analyst adjudicates. Nothing here is approved, and a candidate is not a
//     Finding until a named person says it is.
//   - It does not re-read evidence. Everything it needs is on the tested
//     proposition, so no second interpretation can creep in.
//   - It does not throw the rivals away. A choice you cannot see the alternatives
//     to is an assertion, not an argument, and the whole reason Formation
//     proposes rivals is so the choice can be inspected afterwards.
//
// PURE.
import { deriveEvidenceStrength, deriveConfidence, type EvidenceStrength, type Confidence } from "@/lib/analysis/assessment";
import type { Citation } from "@/lib/analysis/types";
import type { StancedCitation, TestedProposition, TestedSet } from "@/lib/analysis/disconfirmation";

export type AssessedProposition = TestedProposition & {
  strength: EvidenceStrength;
  confidence: Confidence;
};

/** A claim the platform is prepared to put in front of an analyst. Not a
 *  Finding: nothing has adjudicated it, nobody is accountable for it, and it may
 *  yet be reframed, narrowed, split, merged or rejected outright. */
export type CandidateFinding = AssessedProposition & {
  /** The rivals this was chosen over, already assessed, best first. Retained so
   *  the choice is inspectable and so an analyst can promote one instead. */
  alternatives: AssessedProposition[];
  /** Everything examined against the question, admitted or not. */
  examined: number;
};

export type CandidateResult = {
  needId: string;
  need: string;
  /** Null where nothing survived formation, which is an OPEN question rather
   *  than an absence: nothing was established, and nothing established that
   *  nothing could be. */
  candidate: CandidateFinding | null;
  assessed: AssessedProposition[];
};

const toCitations = (citations: StancedCitation[]): Citation[] =>
  citations.map(c => ({
    stance: c.stance,
    admissibility: c.admissibility,
    contribution: c.contribution,
    observationKey: c.observationKey,
    observations: c.observations,
    weight: c.bearing,
  }));

/** Grade one tested proposition. The grader sees the grounds and the assertion
 *  type and nothing else: not the rivals, not the reading, not how well it is
 *  written (Principle 10). */
export function assess(proposition: TestedProposition, examined: number): AssessedProposition {
  const citations = toCitations(proposition.citations);
  return {
    ...proposition,
    strength: deriveEvidenceStrength(citations),
    confidence: deriveConfidence({
      citations,
      assertion: proposition.assertion,
      disconfirmed: proposition.disconfirmation.ran,
      examined,
    }),
  };
}

const CONFIDENCE_RANK = { High: 3, Medium: 2, Low: 1 } as const;

/** Order rivals by what the evidence supports, never by how they read.
 *
 *  A null proposition competes on the same scale as every other, which is the
 *  point: where the best positive reading is weak and the search was thorough,
 *  "we could not establish this" is the better answer and must be able to win. */
export function rank(propositions: AssessedProposition[]): AssessedProposition[] {
  return [...propositions].sort((a, b) => {
    const byConfidence = CONFIDENCE_RANK[b.confidence.level] - CONFIDENCE_RANK[a.confidence.level];
    if (byConfidence !== 0) return byConfidence;

    const byStrength = b.strength.score - a.strength.score;
    if (byStrength !== 0) return byStrength;

    // Independent observations before item counts, and a claim that survived
    // contestation before one that was never contested at equal grade.
    const byObservations = b.strength.independence.supporting - a.strength.independence.supporting;
    if (byObservations !== 0) return byObservations;

    return a.disconfirmation.contesting - b.disconfirmation.contesting;
  });
}

/** Assess a tested set, rank the rivals, and promote the best supported.
 *
 *  The candidate is the proposition the EVIDENCE best supports, which is not
 *  necessarily the one a reader would find most interesting. That gap is the
 *  reason the alternatives travel with it. */
export function toCandidate(set: TestedSet): CandidateResult {
  const assessed = rank(set.propositions.map(p => assess(p, set.examined)));
  const [best, ...rest] = assessed;

  return {
    needId: set.needId,
    need: set.need,
    candidate: best ? { ...best, alternatives: rest, examined: set.examined } : null,
    assessed,
  };
}

// ── The analyst surface ──────────────────────────────────────────────────────

/** Why this candidate was chosen over its rivals, in plain language. The
 *  reasoning model is not the interface (Principle 17), so the comparison is
 *  explained rather than tabulated. */
export function explainChoice(candidate: CandidateFinding): string {
  if (candidate.alternatives.length === 0) {
    return "Only one reading of this evidence was proposed, so there was nothing to weigh it against.";
  }
  const runnerUp = candidate.alternatives[0];
  const same = runnerUp.confidence.level === candidate.confidence.level;

  const lead = candidate.isNull
    ? `The evidence was judged not to answer this question`
    : `This reading was chosen over ${candidate.alternatives.length} other${candidate.alternatives.length === 1 ? "" : "s"}`;

  const because = same
    ? `it rests on more independent observations than the next best reading, which reached the same confidence`
    : `it reached ${candidate.confidence.level} confidence where the next best reached ${runnerUp.confidence.level}`;

  return `${lead}, because ${because}. Every reading proposed is kept, so the choice can be reopened.`;
}

/** Whether an analyst should look at this before anything else. Not a quality
 *  score: a flag that the automatic choice is doing something a person ought to
 *  see. */
export function needsAttention(candidate: CandidateFinding): string[] {
  const flags: string[] = [];
  if (candidate.confidence.level === "Low") flags.push("The best available reading is only weakly supported.");
  if (candidate.isNull) flags.push("The evidence does not answer this question.");
  if (candidate.disconfirmation.contesting > 0) flags.push("Evidence points the other way and has not been resolved.");
  if (!candidate.disconfirmation.ran) flags.push("This claim was never tested against evidence that would contradict it.");
  if (candidate.rejectedCitations.length > 0) flags.push("Evidence was offered for this claim that cannot support it.");

  const rival = candidate.alternatives[0];
  if (rival && rival.confidence.level === candidate.confidence.level && rival.strength.score === candidate.strength.score) {
    flags.push("A rival reading is supported exactly as well, so the choice between them is not settled by the evidence.");
  }
  return flags;
}
