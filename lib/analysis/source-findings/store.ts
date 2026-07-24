// Persistence for source findings, on the shared findings tables (migration 143
// + 146). Reuses the finding lifecycle, evidence and revision history rather than
// a parallel store, so an approve/set-aside is the same audited act whatever
// layer a finding is in.
//
// STORAGE ONLY. It computes no confidence and decides no rank; evidence strength
// is carried from the extractor, which read it off the real data.
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  contributionForSource, observationKeyForFinding, SOURCE_KIND_LABEL,
  type SourceFindingDraft,
} from "@/lib/analysis/source-findings/types";

const ENGINE = "engine";

export type PersistedSourceFindings = { written: number; superseded: number };

/** Persist one source unit's drafts.
 *
 *  Re-extraction SUPERSEDES the unit's previous unadjudicated candidates and
 *  leaves anything a person approved, set aside or rejected alone — the same
 *  discipline persistRun uses, so re-running extraction never destroys a
 *  decision. Scoped to one source_ref, so one survey re-extracting never touches
 *  another's findings. */
export async function persistSourceFindings(opts: {
  projectId: string;
  sourceRef: string;
  drafts: SourceFindingDraft[];
  runId?: string | null;
}): Promise<PersistedSourceFindings> {
  const { projectId, sourceRef, drafts } = opts;

  // Supersede first, so a mid-way failure leaves the prior set intact.
  const { data: superseded } = await supabaseAdmin
    .from("findings")
    .update({ status: "superseded" })
    .eq("research_project_id", projectId)
    .eq("finding_layer", "source")
    .eq("source_ref", sourceRef)
    .in("status", ["candidate", "in_review"])
    .select("id");

  if (drafts.length === 0) {
    return { written: 0, superseded: (superseded ?? []).length };
  }

  const findingRows: Record<string, unknown>[] = [];
  const evidenceRows: Record<string, unknown>[] = [];
  const revisionRows: Record<string, unknown>[] = [];

  for (const d of drafts) {
    const id = randomUUID();
    const anchor = `src:${d.sourceKind}:${d.sourceRef}`;
    findingRows.push({
      id,
      research_project_id: projectId,
      finding_layer: "source",
      source_kind: d.sourceKind,
      source_ref: d.sourceRef,
      // Source findings anchor to the SOURCE, not a design requirement — grouping
      // on the board is by source. The final analysis re-assigns approved
      // findings to requirements (lib/analysis/gather-findings.ts).
      requirement_key: anchor,
      requirement_text: d.sourceLabel,
      need_id: anchor,
      need_text: SOURCE_KIND_LABEL[d.sourceKind],
      aspect: SOURCE_KIND_LABEL[d.sourceKind],
      statement: d.statement,
      assertion_type: "descriptive",
      scope: d.scope,
      temporal_validity: "point_in_time",
      is_null: false,
      evidence_strength: d.evidenceStrength,
      assessment: {},
      disconfirmed: false,
      disconfirmation: {},
      status: "candidate",
      authored_by: ENGINE,
      version: 1,
      run_id: opts.runId ?? null,
    });

    d.citations.forEach((c, i) => {
      evidenceRows.push({
        finding_id: id,
        evidence_ref: `${id}#${i}`,
        stance: "establishes",
        admissibility: "admissible",
        contribution_kind: contributionForSource(d.sourceKind),
        evidence_role: "direct",
        observation_key: observationKeyForFinding(d.sourceKind, d.sourceRef, id),
        observations: 1,
        bearing: null,
        rejected: false,
        snippet: c.snippet,
        provenance: c.provenance,
      });
    });

    revisionRows.push({
      finding_id: id, version: 1, action: "created", actor: ENGINE,
      summary: `Extracted from ${SOURCE_KIND_LABEL[d.sourceKind]} (${d.sourceLabel}).`,
      after: { statement: d.statement, source_kind: d.sourceKind },
    });
  }

  const { error: fErr } = await supabaseAdmin.from("findings").insert(findingRows);
  if (fErr) throw new Error(fErr.message);
  if (evidenceRows.length > 0) {
    const { error: eErr } = await supabaseAdmin.from("finding_evidence").insert(evidenceRows);
    if (eErr) throw new Error(eErr.message);
  }
  const { error: rErr } = await supabaseAdmin.from("finding_revisions").insert(revisionRows);
  if (rErr) throw new Error(rErr.message);

  return { written: findingRows.length, superseded: (superseded ?? []).length };
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** The live working set of source findings: candidate/in_review/approved/set
 *  aside (superseded and rejected stay in the record but off the board). */
const LIVE_STATUSES = ["candidate", "in_review", "approved", "set_aside"] as const;

export type SourceFindingView = {
  id: string;
  sourceKind: string;
  sourceRef: string;
  sourceLabel: string;
  statement: string;
  scope: string | null;
  evidenceStrength: string | null;
  status: string;
  analystNote: string | null;
  evidence: { snippet: string | null; provenance: string | null }[];
};

export async function listSourceFindings(projectId: string): Promise<SourceFindingView[]> {
  const { data: findings } = await supabaseAdmin
    .from("findings")
    .select("id, source_kind, source_ref, requirement_text, statement, scope, evidence_strength, status, analyst_note")
    .eq("research_project_id", projectId)
    .eq("finding_layer", "source")
    .in("status", LIVE_STATUSES)
    .order("source_kind", { ascending: true })
    .order("created_at", { ascending: true });

  const rows = (findings ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return [];

  const ids = rows.map(r => r.id as string);
  const { data: evidence } = await supabaseAdmin
    .from("finding_evidence")
    .select("finding_id, snippet, provenance")
    .in("finding_id", ids);

  const byFinding = new Map<string, { snippet: string | null; provenance: string | null }[]>();
  for (const e of (evidence ?? []) as Record<string, unknown>[]) {
    const fid = e.finding_id as string;
    byFinding.set(fid, [...(byFinding.get(fid) ?? []), { snippet: (e.snippet as string | null) ?? null, provenance: (e.provenance as string | null) ?? null }]);
  }

  return rows.map(r => ({
    id: r.id as string,
    sourceKind: (r.source_kind as string | null) ?? "conversation",
    sourceRef: (r.source_ref as string | null) ?? "",
    sourceLabel: (r.requirement_text as string | null) ?? "",
    statement: r.statement as string,
    scope: (r.scope as string | null) ?? null,
    evidenceStrength: (r.evidence_strength as string | null) ?? null,
    status: r.status as string,
    analystNote: (r.analyst_note as string | null) ?? null,
    evidence: byFinding.get(r.id as string) ?? [],
  }));
}

export type SourceStatusCounts = { candidate: number; approved: number; set_aside: number; total: number };

/** Per-source-kind counts by status, plus the approved total — what the final
 *  Analysis gate shows before it will run. */
export function summariseSourceFindings(findings: SourceFindingView[]): { byKind: Record<string, SourceStatusCounts>; approvedTotal: number } {
  const byKind: Record<string, SourceStatusCounts> = {};
  let approvedTotal = 0;
  for (const f of findings) {
    const c = byKind[f.sourceKind] ?? { candidate: 0, approved: 0, set_aside: 0, total: 0 };
    c.total++;
    if (f.status === "approved") { c.approved++; approvedTotal++; }
    else if (f.status === "set_aside") c.set_aside++;
    else c.candidate++;
    byKind[f.sourceKind] = c;
  }
  return { byKind, approvedTotal };
}

// ── Bulk adjudication (source findings) ──────────────────────────────────────

/** Approve a set of source findings. Only live, unapproved findings move; every
 *  move is recorded in finding_revisions. Returns how many changed. */
export async function bulkApproveSourceFindings(projectId: string, ids: string[], actor: string): Promise<number> {
  if (ids.length === 0) return 0;
  const { data } = await supabaseAdmin
    .from("findings")
    .update({ status: "approved", reviewed_by: actor, reviewed_at: new Date().toISOString() })
    .eq("research_project_id", projectId)
    .eq("finding_layer", "source")
    .in("id", ids)
    .in("status", ["candidate", "in_review", "set_aside"])
    .select("id, version");
  const moved = (data ?? []) as { id: string; version: number }[];
  if (moved.length > 0) {
    await supabaseAdmin.from("finding_revisions").insert(moved.map(f => ({
      finding_id: f.id, version: f.version ?? 1, action: "approved", actor,
      summary: "Approved for cross-source Analysis.",
    })));
  }
  return moved.length;
}

/** Set a set of source findings aside, with structured feedback stored auditably
 *  for the later AI re-run. */
export async function bulkSetAsideSourceFindings(opts: {
  projectId: string; ids: string[]; actor: string;
  feedbackClass?: string | null; note?: string | null;
}): Promise<number> {
  const { projectId, ids, actor } = opts;
  if (ids.length === 0) return 0;
  const { data } = await supabaseAdmin
    .from("findings")
    .update({ status: "set_aside", reviewed_by: actor, reviewed_at: new Date().toISOString() })
    .eq("research_project_id", projectId)
    .eq("finding_layer", "source")
    .in("id", ids)
    .in("status", ["candidate", "in_review", "approved"])
    .select("id, version");
  const moved = (data ?? []) as { id: string; version: number }[];
  if (moved.length === 0) return 0;

  if (opts.feedbackClass) {
    await supabaseAdmin.from("finding_feedback").insert(moved.map(f => ({
      finding_id: f.id, research_project_id: projectId,
      feedback_class: opts.feedbackClass, note: opts.note ?? null, actor,
    })));
  }
  await supabaseAdmin.from("finding_revisions").insert(moved.map(f => ({
    finding_id: f.id, version: f.version ?? 1, action: "set_aside", actor,
    summary: opts.feedbackClass ? `Set aside: ${opts.feedbackClass}.` : "Set aside.",
  })));
  return moved.length;
}
