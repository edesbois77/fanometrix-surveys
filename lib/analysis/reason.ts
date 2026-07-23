// The reasoning pipeline, end to end (docs/intelligence-model.md §5).
//
// Gather → Frame → Form → Disconfirm → Assess → Rank → Candidate.
//
// Deliberately a thin composition. Every stage it calls is either pure or a
// single model call, and this file adds no judgement of its own: if a rule is
// not visible in one of the stages, it does not exist. It never persists, so the
// route decides storage, and it never approves, so a person decides truth.
import { gatherFrames } from "@/lib/analysis/gather";
import { formPropositions } from "@/lib/analysis/formation";
import { disconfirm } from "@/lib/analysis/disconfirmation";
import { toCandidate, type CandidateResult } from "@/lib/analysis/candidate";
import { coverageForNeed, rollUpCoverage, type NeedCoverage, type Coverage } from "@/lib/analysis/coverage";
import { declaredNeeds } from "@/lib/analysis/assignment";
import { isApproved, type ResearchDesign } from "@/lib/research-design";
import { supabaseAdmin } from "@/lib/supabase-admin";

/** Needs reasoned over concurrently. Each need is an independent line of
 *  reasoning, so nothing is lost by overlapping them, and the bound protects the
 *  model provider from a wide research design. */
const CONCURRENCY = 3;

export type ReasoningRun = {
  projectId: string;
  results: CandidateResult[];
  /** Coverage over every question the DESIGN declared, not over the questions
   *  that happened to receive evidence. The honest denominator. */
  coverage: Coverage;
  /** Questions the design declared that no evidence reached at all. Open, and
   *  distinct from questions we examined and could not answer. */
  unexamined: { needId: string; need: string }[];
  /** Sources the design could not assign to any question. */
  unmapped: { evidenceType: string; evidenceId: string; reason: string }[];
};

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

export async function reasonOverProject(projectId: string): Promise<ReasoningRun> {
  const { gathered, unmapped } = await gatherFrames(projectId);

  const results = await pool(gathered, CONCURRENCY, async ({ need, frame }) => {
    const proposed = await formPropositions({
      need: { id: need.id, need: need.need, aspect: need.aspect },
      frame,
    });
    const challenged = await disconfirm({ set: proposed, frame });
    return toCandidate(challenged);
  });

  // Coverage is measured against what the design SET OUT to learn. A question
  // nobody collected evidence for is open, and counting only the questions that
  // received evidence would let a thin project report full coverage.
  const { data: projectRow } = await supabaseAdmin
    .from("research_projects").select("research_design").eq("id", projectId).maybeSingle();
  const design = (projectRow?.research_design as ResearchDesign | null) ?? null;
  const declared = design && isApproved(design) ? declaredNeeds(design.requirements) : [];

  const reachedIds = new Set(results.map(r => r.needId));
  const unexamined = declared
    .filter(n => !reachedIds.has(n.id))
    .map(n => ({ needId: n.id, need: n.need }));

  const needCoverage: NeedCoverage[] = [
    ...results.map(r => coverageForNeed(
      r.needId,
      r.candidate ? [{ confidence: r.candidate.confidence.level, isAbsence: r.candidate.isNull }] : [],
    )),
    ...unexamined.map(n => coverageForNeed(n.needId, [])),
  ];

  return { projectId, results, coverage: rollUpCoverage(needCoverage), unexamined, unmapped };
}
