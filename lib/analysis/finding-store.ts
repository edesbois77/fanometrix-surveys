// Persistence for Findings (migration 143).
//
// STORAGE, AND NOTHING ELSE. It computes no confidence, decides no rank, drops
// no citation and approves nothing. Everything it writes was decided by a pure
// function upstream, which is what keeps a stored grade reproducible: re-deriving
// it from finding_evidence must give the same answer, and it cannot if storage
// has an opinion of its own.
//
// The row mapping is pure and exported. The writes are thin and have no branches
// worth testing, so the part that could be wrong is testable without a database.
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ASSERTION_TAXONOMY_VERSION } from "@/lib/analysis/types";
import { MATRIX_VERSION } from "@/lib/analysis/matrix";
import type { AssessedProposition } from "@/lib/analysis/candidate";
import type { ReasoningRun } from "@/lib/analysis/reason";
import type { FlatNeed } from "@/lib/information-needs";

/** Written by the engine. A person becomes the author only by authoring, and a
 *  person becomes accountable only by approving. */
export const ENGINE_AUTHOR = "engine";

export type FindingRow = {
  id: string;
  research_project_id: string;
  requirement_key: string;
  requirement_text: string;
  need_id: string;
  need_text: string;
  aspect: string | null;
  statement: string;
  assertion_type: string;
  scope: string | null;
  temporal_validity: "structural" | "periodic" | "point_in_time";
  warrant: string | null;
  reading: string | null;
  is_null: boolean;
  confidence_level: string;
  evidence_strength: string;
  assessment: Record<string, unknown>;
  disconfirmed: boolean;
  disconfirmation: Record<string, unknown>;
  rank: number;
  status: "candidate";
  authored_by: string;
  version: number;
  run_id: string;
  model: string | null;
  matrix_version: number;
  assertion_taxonomy_version: number;
};

export type EvidenceRow = {
  finding_id: string;
  evidence_ref: string;
  stance: string;
  admissibility: string;
  constraint_note: string | null;
  contribution_kind: string;
  evidence_role: string;
  observation_key: string;
  observations: number;
  bearing: number | null;
  rejected: boolean;
  rejected_reason: string | null;
  snippet: string | null;
  provenance: string | null;
};

/** How long a claim of this kind stays true.
 *
 *  Derived from the assertion type because it cannot be retrofitted: a claim
 *  recorded without its perishability can never be aged correctly afterwards, so
 *  a default is written now and an analyst can correct it. What people currently
 *  say is perishable; what verifiably happened is not; a trend belongs to the
 *  period it was measured over. */
export function temporalValidityFor(assertion: string): FindingRow["temporal_validity"] {
  switch (assertion) {
    case "temporal":    return "periodic";
    case "descriptive": return "point_in_time";
    case "magnitude":   return "point_in_time";
    case "comparative": return "point_in_time";
    case "causal":      return "structural";
    case "predictive":  return "point_in_time";
    default:            return "point_in_time";
  }
}

/** One assessed proposition as rows. PURE.
 *
 *  Every proposition from a run becomes a finding, not only the winner. A rival
 *  kept as jsonb on the chosen claim cannot be promoted, cited or adjudicated,
 *  and the whole reason Formation proposes rivals is so an analyst can take a
 *  different one (docs/intelligence-model.md §5). Rank 1 is the candidate. */
export function toRows(opts: {
  projectId: string;
  need: Pick<FlatNeed, "id" | "need" | "aspect" | "requirement">;
  requirementKey: string;
  proposition: AssessedProposition;
  rank: number;
  runId: string;
  model?: string | null;
}): { finding: FindingRow; evidence: EvidenceRow[] } {
  const id = randomUUID();
  const p = opts.proposition;

  const finding: FindingRow = {
    id,
    research_project_id: opts.projectId,
    requirement_key: opts.requirementKey,
    requirement_text: opts.need.requirement,
    need_id: opts.need.id,
    need_text: opts.need.need,
    aspect: opts.need.aspect || null,
    statement: p.statement,
    assertion_type: p.assertion,
    scope: p.scope || null,
    temporal_validity: temporalValidityFor(p.assertion),
    warrant: p.warrant || null,
    reading: p.reading || null,
    is_null: p.isNull,
    confidence_level: p.confidence.level,
    evidence_strength: p.strength.level,
    // The breakdown, so a stored grade can be READ later. It remains a pure
    // function of the citations below, so it can also be RECOMPUTED later, and
    // the two must always agree.
    assessment: {
      confidence: {
        level: p.confidence.level,
        rationale: p.confidence.rationale,
        factors: p.confidence.factors,
        what_would_raise_it: p.confidence.whatWouldRaiseIt,
      },
      strength: {
        level: p.strength.level,
        score: p.strength.score,
        rationale: p.strength.rationale,
        independence: p.strength.independence,
        kinds: p.strength.kinds,
        all_with_limits: p.strength.allWithLimits,
      },
    },
    disconfirmed: p.disconfirmation.ran,
    disconfirmation: {
      searched: p.disconfirmation.searched,
      ran: p.disconfirmation.ran,
      contesting: p.disconfirmation.contesting,
      qualifying: p.disconfirmation.qualifying,
      note: p.disconfirmation.note,
    },
    rank: opts.rank,
    status: "candidate",
    authored_by: ENGINE_AUTHOR,
    version: 1,
    run_id: opts.runId,
    model: opts.model ?? null,
    matrix_version: MATRIX_VERSION,
    assertion_taxonomy_version: ASSERTION_TAXONOMY_VERSION,
  };

  const evidence: EvidenceRow[] = [
    ...p.citations.map(c => ({
      finding_id: id,
      evidence_ref: c.evidenceId,
      stance: c.stance,
      admissibility: c.admissibility,
      constraint_note: c.constraint,
      contribution_kind: c.contribution,
      evidence_role: c.role,
      observation_key: c.observationKey,
      observations: c.observations,
      bearing: c.bearing,
      rejected: false,
      rejected_reason: null,
      snippet: c.content,
      provenance: c.provenance,
    })),
    // Evidence the claim reached for that its own assertion type cannot use.
    // Kept because the reach is a signal about the claim.
    ...p.rejectedCitations.map(r => ({
      finding_id: id,
      evidence_ref: r.evidenceId,
      stance: "establishes",
      admissibility: "admissible_with_limits",
      constraint_note: null,
      contribution_kind: "unknown",
      evidence_role: "direct",
      observation_key: `rejected:${r.evidenceId}`,
      observations: 1,
      bearing: null,
      rejected: true,
      rejected_reason: r.reason,
      snippet: null,
      provenance: null,
    })),
  ];

  return { finding, evidence };
}

// ── Writes ───────────────────────────────────────────────────────────────────

export type PersistedRun = { runId: string; written: number; candidates: number; superseded: number };

/** Persist a reasoning run.
 *
 *  Re-running analysis SUPERSEDES the previous run's unadjudicated candidates
 *  rather than deleting them, and leaves anything a person has already approved
 *  or rejected alone. Nothing is destroyed, so the record of what the platform
 *  believed last month survives, and an approval made last week is not quietly
 *  replaced by a fresh guess. */
export async function persistRun(run: ReasoningRun, opts?: { model?: string | null; runId?: string }): Promise<PersistedRun> {
  // The run id is the analysis_runs row id when a job supplies one, so a
  // project's findings and the run that formed them share one identifier.
  const runId = opts?.runId ?? randomUUID();
  const needIds = run.results.map(r => r.needId);

  // Supersede first, so a failure part-way through leaves the previous run
  // intact rather than leaving two live candidate sets for one question.
  let superseded = 0;
  if (needIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("findings")
      .update({ status: "superseded" })
      .eq("research_project_id", run.projectId)
      .in("need_id", needIds)
      .in("status", ["candidate", "in_review"])
      .select("id");
    superseded = (data ?? []).length;
  }

  const findings: FindingRow[] = [];
  const evidence: EvidenceRow[] = [];
  for (const result of run.results) {
    const need = run.needs.get(result.needId);
    if (!need) continue;
    result.assessed.forEach((proposition, i) => {
      const rows = toRows({
        projectId: run.projectId, need,
        requirementKey: need.requirementKey,
        proposition, rank: i + 1, runId, model: opts?.model ?? null,
      });
      findings.push(rows.finding);
      evidence.push(...rows.evidence);
    });
  }

  if (findings.length > 0) {
    const { error } = await supabaseAdmin.from("findings").insert(findings);
    if (error) throw new Error(error.message);
  }
  if (evidence.length > 0) {
    const { error } = await supabaseAdmin.from("finding_evidence").insert(evidence);
    if (error) throw new Error(error.message);
  }
  if (findings.length > 0) {
    const { error } = await supabaseAdmin.from("finding_revisions").insert(
      findings.map(f => ({
        finding_id: f.id, version: 1, action: "created", actor: ENGINE_AUTHOR,
        summary: `Proposed as reading ${f.rank} for "${f.need_text}".`,
        after: { statement: f.statement, assertion_type: f.assertion_type, confidence_level: f.confidence_level },
      })),
    );
    if (error) throw new Error(error.message);
  }

  return { runId, written: findings.length, candidates: findings.filter(f => f.rank === 1).length, superseded };
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** A row as it comes BACK, which is not the shape it went in as: the database
 *  assigns ids and the lifecycle has moved on from the one value insert writes. */
export type StoredEvidenceRow = EvidenceRow & { id: string };

export type StoredFinding = Omit<FindingRow, "status"> & {
  status: "candidate" | "in_review" | "approved" | "rejected" | "superseded";
  published: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  reject_class: string | null;
  reject_reason: string | null;
  analyst_note: string | null;
  override_confidence: string | null;
  override_reason: string | null;
  supersedes_id: string | null;
  split_from_id: string | null;
  merged_into_id: string | null;
  evidence?: StoredEvidenceRow[];
};

/** Findings for a project. `status` defaults to the live candidate set; pass
 *  "approved" for the set every downstream consumer is entitled to read. */
export async function listFindings(projectId: string, opts?: {
  status?: string[];
  needId?: string;
  topRankOnly?: boolean;
}): Promise<StoredFinding[]> {
  let q = supabaseAdmin
    .from("findings").select("*")
    .eq("research_project_id", projectId)
    .in("status", opts?.status ?? ["candidate", "in_review", "approved"])
    .order("need_id", { ascending: true })
    .order("rank", { ascending: true });

  if (opts?.needId) q = q.eq("need_id", opts.needId);
  if (opts?.topRankOnly) q = q.eq("rank", 1);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as StoredFinding[];
}

/** One finding with its grounds, including the citations it reached for and
 *  could not use. */
export async function getFinding(id: string): Promise<StoredFinding | null> {
  const { data } = await supabaseAdmin.from("findings").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const { data: evidence } = await supabaseAdmin
    .from("finding_evidence").select("*").eq("finding_id", id).order("rejected", { ascending: true });
  return { ...(data as StoredFinding), evidence: (evidence ?? []) as StoredEvidenceRow[] };
}

/** The approved set, which is the only thing Reports, Recommendations and
 *  Knowledge are entitled to read (Principle 3). */
export const approvedFindings = (projectId: string): Promise<StoredFinding[]> =>
  listFindings(projectId, { status: ["approved"] });
