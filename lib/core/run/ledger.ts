// ── Fanometrix Analytical Core — run ledger builder (Stage 5B, pure) ──────────
// Turns a pipeline AnalysisResult into an auditable AnalyticalRun (summaries +
// ledger + provenance). No DB, no chain-of-thought — only governed inputs and
// structured decisions. Timestamps/status are supplied by the caller (purity).

import type { DiscoveryInput } from "../candidates/types";
import type { AnalysisResult } from "../pipeline/analyse";
import type { AnalyticalRun, LedgerEntry, ModelProvenance, RunSource, RunStatus, RunSummaries, VersionSet } from "./types";
import { fingerprintInput } from "./fingerprint";
import type { Priority } from "../assessment/types";

export type BuildRunInput = {
  id: string;
  source: RunSource;
  sourceVersion?: string | null;
  versions: VersionSet;
  startedAt: string;
  completedAt: string | null;
  status: RunStatus;
  input: DiscoveryInput;
  result: AnalysisResult;
  modelProvenance?: ModelProvenance[];
  errors?: string[];
  warnings?: string[];
};

function summarise(result: AnalysisResult): RunSummaries {
  const o = result.outcomes;
  const byKind = (kind: string) => o.filter((x) => x.candidate.kind === kind);
  const decisionCounts = (kind: string) => ({
    approved: byKind(kind).filter((x) => x.finalState === "promoted" || (x.finalState !== "rejected" && x.finalState !== "held_for_semantic_review")).length,
    rejected: byKind(kind).filter((x) => x.finalState === "rejected").length,
    held: byKind(kind).filter((x) => x.finalState === "held_for_semantic_review").length,
  });
  const disconfirmation: Record<string, number> = {};
  for (const x of o) if (x.disconfirmation) disconfirmation[x.disconfirmation.status] = (disconfirmation[x.disconfirmation.status] ?? 0) + 1;
  const prio = (p: Priority) => (["primary", "secondary", "contextual", "suppressed"] as Priority[]).includes(p) ? result.hierarchy[p].length : 0;
  return {
    candidatesGenerated: o.length,
    candidatesRejected: o.filter((x) => x.finalState === "rejected").length,
    candidatesHeld: o.filter((x) => x.finalState === "held_for_semantic_review").length,
    groupingDecisions: decisionCounts("semantic_grouping"),
    synthesisDecisions: decisionCounts("cross_question_synthesis"),
    disconfirmation,
    findingsPromoted: o.filter((x) => x.finalState === "promoted").length,
    findingsSuppressed: o.filter((x) => x.finalState === "suppressed").length,
    priority: { primary: prio("primary"), secondary: prio("secondary"), contextual: prio("contextual"), suppressed: prio("suppressed") },
  };
}

function ledgerOf(result: AnalysisResult): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  for (const x of result.outcomes) {
    entries.push({
      stage: "candidate", refId: x.candidate.id, status: x.finalState,
      ruleIds: x.assessment?.eligibility.governanceIssueIds,
      evidenceIds: x.candidate.evidence.map((e) => e.id),
      rationale: x.decisionReason,
    });
    if (x.candidate.kind === "semantic_grouping") entries.push({ stage: "grouping_decision", refId: x.candidate.id, status: x.finalState, rationale: x.candidate.stateReason ?? x.decisionReason });
    if (x.candidate.kind === "cross_question_synthesis") entries.push({ stage: "synthesis_decision", refId: x.candidate.id, status: x.finalState, rationale: x.candidate.stateReason ?? x.decisionReason });
    if (x.disconfirmation) entries.push({ stage: "disconfirmation", refId: x.candidate.id, status: x.disconfirmation.status, evidenceIds: x.disconfirmation.evidenceIds, rationale: x.disconfirmation.reasons.join("; ") });
    if (x.assessment) entries.push({ stage: "ranking", refId: x.candidate.id, status: x.assessment.priority, rationale: x.assessment.priorityReasons.join("; ") });
  }
  return entries;
}

export function buildRun(b: BuildRunInput): AnalyticalRun {
  return {
    id: b.id, source: b.source, sourceVersion: b.sourceVersion ?? null, versions: b.versions,
    startedAt: b.startedAt, completedAt: b.completedAt, status: b.status,
    inputFingerprint: fingerprintInput(b.input),
    modelProvenance: b.modelProvenance ?? [],
    summaries: summarise(b.result),
    ledger: ledgerOf(b.result),
    errors: b.errors ?? [], warnings: b.warnings ?? [],
  };
}
