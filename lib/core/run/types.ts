// ── Fanometrix Analytical Core — AnalyticalRun contracts (Stage 5B) ───────────
// One execution of a versioned Core over a specific governed input, made
// reproducible and auditable. Product-INDEPENDENT: a run is keyed by a generic
// source identity, never `surveyId`. Shadow-only; no production persistence.
// The ledger stores governed inputs + structured decisions + provenance — NEVER
// model chain-of-thought.

export type RunStatus = "pending" | "running" | "completed" | "completed_with_warnings" | "failed";

/** Generic source identity — a survey, project, search, document set, campaign… */
export type RunSource = { kind: string; id: string; metadata?: Record<string, unknown> };

/** Standard v1.1 versioning kept distinct (Decision 13) — never one field. */
export type VersionSet = {
  standardVersion: string;
  coreVersion: string;
  pipelineVersion: string;
  semanticRubricVersions: Record<string, string>; // e.g. { grouping: "grouping_semantic_v1" }
  /** The ConstructInterpretation contract version (Stage 5R.2, Standard v1.2 §47.2)
   *  — so a historical Finding can answer which interpretation schema produced it.
   *  Optional/back-compatible; no construct-registry version exists yet. */
  semanticSchemaVersion?: string;
};

/** One semantic model operation's provenance. NO chain-of-thought. */
export type ModelProvenance = {
  operation: "grouping" | "synthesis" | "disconfirmation";
  provider: string;
  model: string;
  rubricVersion: string;
  inputRefs: string[];          // the governed ids supplied
  outcome: "used" | "rejected" | "held";
  validationPassed: boolean;
  reason?: string;
  usage?: { promptTokens?: number; completionTokens?: number; durationMs?: number };
};

/** One ledger entry — a step in the analytical path (audit trail). */
export type LedgerEntry = {
  stage: "candidate" | "grouping_decision" | "synthesis_decision" | "disconfirmation" | "governance" | "assessment" | "ranking";
  refId: string;                // candidate/finding id
  status: string;               // e.g. "generated" | "rejected" | "held" | "promoted" | "suppressed"
  ruleIds?: string[];
  evidenceIds?: string[];
  rationale?: string;           // concise permitted rationale, NOT hidden reasoning
};

export type RunSummaries = {
  candidatesGenerated: number;
  candidatesRejected: number;
  candidatesHeld: number;
  groupingDecisions: { approved: number; rejected: number; held: number };
  synthesisDecisions: { approved: number; rejected: number; held: number };
  disconfirmation: Record<string, number>; // status → count
  findingsPromoted: number;
  findingsSuppressed: number;
  priority: { primary: number; secondary: number; contextual: number; suppressed: number };
};

export type AnalyticalRun = {
  id: string;
  source: RunSource;
  sourceVersion: string | null;   // e.g. the study's data version, when known
  versions: VersionSet;
  startedAt: string;              // caller-supplied (module stays pure)
  completedAt: string | null;
  status: RunStatus;
  inputFingerprint: string;       // deterministic hash of the governed input
  modelProvenance: ModelProvenance[];
  summaries: RunSummaries;
  ledger: LedgerEntry[];
  errors: string[];
  warnings: string[];
};
