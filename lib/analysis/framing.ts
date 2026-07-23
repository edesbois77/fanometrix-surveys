// Framing: building the admissible evidence set for one information need
// (docs/intelligence-model.md §4 Layer 2, §5 FRAMING).
//
// This is the stage the shipped engine had no equivalent of, and its absence is
// why correctly-acquired, on-point coverage could score zero against a need it
// genuinely informed. Framing asks a different question from the one that
// failed. Not "is this evidence any good?" but "what can THIS evidence
// legitimately establish for THIS question?"
//
// The distinction matters more as sources multiply. There is no such thing as
// good evidence, only evidence that is good FOR SOMETHING, so the same item is
// framed differently for different needs and nothing is ever globally ranked.
//
// PURE. Turning approved evidence rows into FramedItems belongs with the
// formation job; this file decides admissibility and nothing else, so the rules
// stay recomputable and testable without a database.
import type { EvidenceRole } from "@/lib/evidence-role";
import { EVIDENCE_ROLES, EVIDENCE_ROLE_LABEL } from "@/lib/evidence-role";
import type { MethodFit } from "@/lib/information-needs";
import type {
  AssertionType, ContributionKind, Admissibility, Citation, CitationStance,
} from "@/lib/analysis/types";
import { compatibility, combinationViolations, type CombinationViolation } from "@/lib/analysis/matrix";

/** The relevance floor for admitting an item to a frame at all. A policy of the
 *  NEED, not of the source: the same item may clear the bar for one question and
 *  fail it for the next, which is the whole point of framing per need. */
export const DEFAULT_BEARING_FLOOR = 0.5;

/** One piece of validated evidence, offered to one information need. Everything
 *  here except `bearing` travels from collection unchanged. */
export type FramedItem = {
  evidenceId: string;
  /** What kind of knowledge this item's source is contracted to supply.
   *  INHERITED from the Source Contract (via `resolve`), never inferred here.
   *  The only thing the matrix consults, and the reason nothing downstream needs
   *  to know which connector produced it. */
  contribution: ContributionKind;
  /** Why it was collected. Governs ATTRIBUTION rather than admissibility, so it
   *  is carried through the frame rather than gating it (see §Role below). */
  role: EvidenceRole;
  /** 0 to 1: how directly this item bears on THIS need, judged upstream against
   *  the need itself.
   *
   *  NULL where the item was ASSIGNED to the need by the approved design but no
   *  per-item judgement has been made against it (lib/analysis/assignment.ts).
   *  Null is unknown, never zero: the design commissioned this source to answer
   *  this question, so the item is admitted, but nothing has yet judged how far
   *  this particular item does so. Unknown weight scores nothing in the
   *  assessment layer, which is the conservative outcome, and inventing a number
   *  to fill the gap would be the one genuinely dishonest option. */
  bearing: number | null;
  /** The observation unit behind this item, declared by its Source Contract.
   *  Two items sharing it are one observation. */
  observationKey: string;
  /** How many independent observations this item carries, declared by its Source
   *  Contract. One for most items, more where the item aggregates. */
  observations: number;
  /** The approved Research Design's verdict on whether the METHOD that produced
   *  this item could answer this need. Carried here rather than discarded, which
   *  is what used to happen: the design reasoned carefully about what each method
   *  could do, and every source was then handed the same undifferentiated list
   *  (docs/evidence-contribution.md §1). */
  methodFit: MethodFit;
  /** Carried so an exclusion can be explained concretely rather than abstractly. */
  provenance: string | null;
};

export type ExclusionReason = "does_not_bear" | "kind_cannot_support" | "method_not_suitable";

/** An excluded item, with the reason it was excluded. Never a silent drop
 *  (invariant 7): an exclusion the analyst cannot see is indistinguishable from
 *  evidence we failed to collect. */
export type Exclusion = {
  evidenceId: string;
  reason: ExclusionReason;
  /** Plain language, shown to a person. */
  message: string;
};

export type EvidenceFrame = {
  needId: string;
  /** Items that bear on the need. What they may be used to SAY is decided per
   *  assertion type, by projectFor. */
  admitted: FramedItem[];
  excluded: Exclusion[];
  /** Everything examined against this need, admitted or not. The honest
   *  denominator for coverage, and the count an absence claim is judged on. */
  examined: number;
  kinds: ContributionKind[];
  /** Independent observations among admitted items, summed across distinct
   *  observation units. Not an item count, and deliberately different from one. */
  observations: number;
  /** How the frame is composed by role. A frame that is mostly comparative
   *  evidence cannot carry much of a direct claim about the client, and saying so
   *  before a claim is written is cheaper than discovering it at warranting. */
  roles: Record<EvidenceRole, number>;
  /** What this frame could support, before any claim is written. Deterministic,
   *  and the most useful thing framing tells an analyst: "this evidence cannot
   *  answer that question, whatever it says." */
  supportable: AssertionType[];
};

const ALL_ASSERTIONS: AssertionType[] = [
  "descriptive", "comparative", "magnitude", "temporal", "causal", "predictive", "absence",
];

/** Independent observations across a set of items: summed over DISTINCT
 *  observation units, never over items. The same reduction the assessment layer
 *  applies to citations, kept identical here so a frame and the grade it later
 *  produces cannot describe the same evidence differently. */
export function countObservations(items: Pick<FramedItem, "observationKey" | "observations">[]): number {
  const byUnit = new Map<string, number>();
  for (const i of items) {
    const size = Math.max(1, Math.floor(i.observations));
    byUnit.set(i.observationKey, Math.max(byUnit.get(i.observationKey) ?? 0, size));
  }
  return [...byUnit.values()].reduce((a, b) => a + b, 0);
}

export function frameEvidence(opts: {
  needId: string;
  /** Everything examined against this need. Items below the bearing floor are
   *  passed in too, and excluded here, so `examined` is honest. */
  items: FramedItem[];
  bearingFloor?: number;
}): EvidenceFrame {
  const floor = opts.bearingFloor ?? DEFAULT_BEARING_FLOOR;

  const admitted: FramedItem[] = [];
  const excluded: Exclusion[] = [];
  for (const item of opts.items) {
    // An unjudged item is admitted on the strength of the design's assignment.
    // Only a judgement that came back BELOW the floor excludes.
    if (typeof item.bearing === "number" && item.bearing < floor) {
      excluded.push({
        evidenceId: item.evidenceId,
        reason: "does_not_bear",
        message: `Does not bear closely enough on this question${item.provenance ? ` (${item.provenance})` : ""}.`,
      });
      continue;
    }
    admitted.push(item);
  }

  const kinds = [...new Set(admitted.map(i => i.contribution))].sort();
  const roles = Object.fromEntries(
    EVIDENCE_ROLES.map(r => [r, admitted.filter(i => i.role === r).length]),
  ) as Record<EvidenceRole, number>;

  const frame: EvidenceFrame = {
    needId: opts.needId, admitted, excluded, examined: opts.items.length,
    kinds, observations: countObservations(admitted), roles, supportable: [],
  };
  // Derived from the same code path the real projection uses, so the promise the
  // frame makes and the projection it later produces can never disagree.
  frame.supportable = ALL_ASSERTIONS.filter(a => projectFor(frame, a).supportable);
  return frame;
}

// ── Projection: what this frame may be used to claim ─────────────────────────

/** One admitted item, resolved against a specific kind of claim. The unit
 *  warranting turns into a Citation once a stance is decided. */
export type AdmittedForClaim = {
  evidenceId: string;
  contribution: ContributionKind;
  role: EvidenceRole;
  observationKey: string;
  observations: number;
  /** Null where the item was assigned by the design but not yet judged against
   *  this need. Unknown, never zero. */
  bearing: number | null;
  admissibility: Exclude<Admissibility, "inadmissible">;
  /** The condition this item is admitted under. Survives onto the claim, so a
   *  constrained citation is never quietly treated as an unconstrained one. */
  constraint: string | null;
};

export type Projection = {
  assertion: AssertionType;
  admitted: AdmittedForClaim[];
  /** Items the matrix rules out for THIS kind of claim, though they remain in
   *  the frame and may well carry a different one. */
  excluded: Exclusion[];
  /** Combination rules already broken, before a word has been written. */
  violations: CombinationViolation[];
  /** Whether a claim of this kind can be made from this frame at all. */
  supportable: boolean;
};

export function projectFor(frame: EvidenceFrame, assertion: AssertionType): Projection {
  const admitted: AdmittedForClaim[] = [];
  const excluded: Exclusion[] = [];

  for (const item of frame.admitted) {
    const cell = compatibility(assertion, item.contribution);
    if (cell.verdict === "inadmissible") {
      excluded.push({
        evidenceId: item.evidenceId,
        reason: "kind_cannot_support",
        message: cell.constraint ?? "This kind of evidence cannot support this kind of claim.",
      });
      continue;
    }
    // The design's own verdict on the method, applied AFTER the matrix and only
    // ever downwards. A design that judged a method suitable cannot make
    // inadmissible evidence admissible: the matrix stays the gate, and method
    // fit can only tighten what passes through it.
    if (item.methodFit === "not_suitable") {
      excluded.push({
        evidenceId: item.evidenceId,
        reason: "method_not_suitable",
        message: "The approved Research Design judged this method unable to answer this question.",
      });
      continue;
    }
    const verdict = item.methodFit === "conditional" ? "admissible_with_limits" : cell.verdict;
    const constraint = item.methodFit === "conditional" && cell.verdict === "admissible"
      ? "The approved Research Design judged this method only conditionally able to answer this question."
      : cell.constraint;

    admitted.push({
      evidenceId: item.evidenceId, contribution: item.contribution, role: item.role,
      observationKey: item.observationKey, observations: item.observations, bearing: item.bearing,
      admissibility: verdict, constraint,
    });
  }

  const kinds = [...new Set(admitted.map(i => i.contribution))].sort();
  const allWithLimits = admitted.length > 0 && admitted.every(i => i.admissibility === "admissible_with_limits");
  const violations = combinationViolations({ assertion, kinds, allWithLimits });

  // An absence claim is supportable whenever anything was examined, because it
  // rests on the search rather than on grounds (compatibility-matrix §7). Nothing
  // examined is not an absence finding, it is an open question.
  const supportable = assertion === "absence"
    ? frame.examined > 0
    : admitted.length > 0 && !violations.some(v => v.rule === "6.1");

  return { assertion, admitted, excluded, violations, supportable };
}

/** Bind an admitted item to a claim with a stance. The seam between framing and
 *  warranting: framing decides what MAY be used, warranting decides what each
 *  item DOES for the claim, and only then is there a Citation to assess. */
export function toCitation(item: AdmittedForClaim, stance: CitationStance): Citation {
  return {
    stance,
    admissibility: item.admissibility,
    contribution: item.contribution,
    observationKey: item.observationKey,
    observations: item.observations,
    weight: item.bearing,
  };
}

// ── Role ─────────────────────────────────────────────────────────────────────
// Role governs ATTRIBUTION, not admissibility, so it never gates a frame: a
// comparative item is perfectly admissible for a claim about rival sponsors and
// inadmissible for the same claim about the client. That depends on the claim's
// SUBJECT, which framing does not know and warranting does. Framing therefore
// carries role forward and reports the mix, and the rule below is enforced where
// the subject is visible.
//
// This is the same discipline as compatibility-matrix §6.3: a rule enforced in
// the wrong place, on incomplete information, is worse than a rule enforced
// properly one stage later.

/** Whether a frame can carry much of a claim about the research subject itself.
 *  Advisory, and deliberately so: it informs what to attempt, it does not gate. */
export function directEvidenceShare(frame: EvidenceFrame): number {
  const total = frame.admitted.length;
  return total === 0 ? 0 : frame.roles.direct / total;
}

/** A plain sentence describing what the frame is made of, for the analyst
 *  surface. The reasoning model is not the interface (Principle 18), so the
 *  frame explains itself in the language of research rather than of the model. */
export function describeFrame(frame: EvidenceFrame): string {
  if (frame.admitted.length === 0) {
    return frame.examined === 0
      ? "No evidence has been examined against this question yet."
      : `${frame.examined} item${frame.examined === 1 ? "" : "s"} were examined and none of them bears closely enough on this question.`;
  }
  const roleParts = EVIDENCE_ROLES
    .filter(r => frame.roles[r] > 0)
    .map(r => `${frame.roles[r]} ${EVIDENCE_ROLE_LABEL[r].toLowerCase()}`);
  const obs = `standing on ${frame.observations} independent observation${frame.observations === 1 ? "" : "s"}`;
  return `${frame.admitted.length} of ${frame.examined} items bear on this question, ${obs} (${roleParts.join(", ")}).`;
}
