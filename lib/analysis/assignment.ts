// Evidence Assignment — mapping evidence that attaches to a PROJECT onto the
// QUESTIONS the approved Research Design commissioned it to answer.
//
// Two kinds of evidence exist, and only one of them arrives pre-assigned. A
// conversation search or a News task is created BY a requirement and carries its
// Information Needs, so its evidence knows what question it was collected for. A
// survey or a Research Library document is attached to the project as a whole and
// knows nothing about any question. Without assignment that evidence can never
// reach a frame, which is why cross-source triangulation has never worked.
//
// The mapping is DECLARED, never inferred. A source declares which research
// methods it executes (its Source Contract's `fulfils`), the approved design
// declares which methods it commissioned for each requirement, and assignment is
// the intersection. Nothing here reads a document, scores a survey or asks a
// model what an item is about.
//
// SOURCE-AGNOSTIC by construction: this file names no source. A future evidence
// store is assigned by declaring what it fulfils, and nothing here changes.
//
// PURE.
import type { EvidenceRequirement, ResearchMethod } from "@/lib/research-design";
import { RESEARCH_METHOD_LABEL } from "@/lib/research-design";
import { needIdFor, asMethodFit, type FlatNeed, type MethodFit } from "@/lib/information-needs";

/** Worst first. Assignment takes the most conservative verdict available, so the
 *  order is the comparison, not a display preference. */
const FIT_RANK: Record<MethodFit, number> = {
  not_suitable: 0, conditional: 1, supporting: 2, primary: 3,
};

export type Assignment = {
  need: FlatNeed;
  /** The requirement that commissioned the question. */
  requirement: string;
  /** The method whose verdict was applied, and why it was the one applied. */
  viaMethod: ResearchMethod;
};

export type Unassigned = {
  requirement: string;
  reason: string;
};

export type AssignmentResult = {
  assigned: Assignment[];
  /** Requirements this source cannot serve, each with the design's own reason.
   *  Reported rather than dropped: a source with nothing to answer is a finding
   *  about the research design, not an absence of evidence. */
  unassigned: Unassigned[];
};

/** The Information Needs of one requirement, identified.
 *
 *  Uses the SAME seed as the task generators (needIdFor over the requirement's
 *  aspect and the need's text), which is what makes a question served by a
 *  conversation search and by a survey ONE question rather than two. Cross-source
 *  triangulation is a consequence of shared identity, not of a merge step. */
export function needsOf(req: EvidenceRequirement, methodFit: MethodFit): FlatNeed[] {
  const aspect = req.aspect ?? "General";
  return req.information_needs
    .map(need => need.trim())
    .filter(Boolean)
    .map(need => ({
      id: needIdFor(aspect, need), aspect, need,
      method_fit: methodFit, requirement: req.requirement,
    }));
}

/** Stable identity for a requirement, seeded the same way a need's is. A Finding
 *  is anchored to exactly one requirement, so the anchor needs a key rather than
 *  a position in an array, which changes every time the design is regenerated. */
export const requirementIdFor = (req: { aspect: string | null; requirement: string }): string =>
  needIdFor(req.aspect ?? "General", req.requirement).replace("need_", "req_");

/** Assign one source to the questions the design commissioned its method(s) to
 *  answer.
 *
 *  Where a source fulfils several methods and the design recommended more than
 *  one of them, the MOST CONSERVATIVE verdict is applied. A Research Library
 *  document may be an academic study, an industry report or neither, and which it
 *  is cannot be recovered from the file: where we cannot tell which method a
 *  source represents, we assume the one the design trusted least. Consistent with
 *  every other unknown in this layer, and safe in the only direction that
 *  matters, since method fit can lower admissibility and never raise it. */
export function assignSource(opts: {
  /** What the source's contract says it executes. */
  fulfils: ResearchMethod[];
  requirements: EvidenceRequirement[];
}): AssignmentResult {
  const assigned: Assignment[] = [];
  const unassigned: Unassigned[] = [];

  for (const req of opts.requirements) {
    const recommended = (req.evidence_strategy?.recommended_methods ?? [])
      .filter(m => opts.fulfils.includes(m.method));

    if (recommended.length === 0) {
      unassigned.push({
        requirement: req.requirement,
        reason: "The approved design did not commission this kind of research for this requirement.",
      });
      continue;
    }

    // Most conservative verdict among the methods that apply.
    const worst = recommended.reduce((a, b) => (FIT_RANK[asMethodFit(a.fit)] <= FIT_RANK[asMethodFit(b.fit)] ? a : b));
    const fit = asMethodFit(worst.fit);

    if (fit === "not_suitable") {
      unassigned.push({
        requirement: req.requirement,
        reason: `The approved design judged ${RESEARCH_METHOD_LABEL[worst.method]} unable to answer this requirement.`,
      });
      continue;
    }

    const needs = needsOf(req, fit);
    if (needs.length === 0) {
      unassigned.push({
        requirement: req.requirement,
        reason: "This requirement states no answerable questions, so there is nothing to assign evidence to.",
      });
      continue;
    }

    for (const need of needs) {
      assigned.push({ need, requirement: req.requirement, viaMethod: worst.method });
    }
  }

  return { assigned, unassigned };
}

/** Every Information Need the design declares, across all requirements,
 *  identified. The honest denominator for project-level coverage: what we set out
 *  to learn, whether or not any evidence arrived to answer it. */
export function declaredNeeds(requirements: EvidenceRequirement[]): FlatNeed[] {
  const byId = new Map<string, FlatNeed>();
  for (const req of requirements) {
    // Coverage counts questions, not methods, so the fit recorded here is not a
    // verdict about any source. `conditional` is the neutral placeholder and is
    // never read as an assignment.
    for (const need of needsOf(req, "conditional")) {
      if (!byId.has(need.id)) byId.set(need.id, need);
    }
  }
  return [...byId.values()];
}
