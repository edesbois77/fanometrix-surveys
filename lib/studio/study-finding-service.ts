// ── Survey Studio — Study Finding service (server-only) ──────────────────────
// Durable, human-owned Findings. Evidence is COPIED + FROZEN at creation from an
// immutable source (an Analysis Run snapshot, or a server-resolved Study Result for
// manual findings) and never re-resolved — a published conclusion never drifts.
// No LLM here. No survey_findings. No entitlement/Report/Discover side effects.

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AuthedUser } from "@/lib/auth-server";
import { canCurateStudies } from "@/lib/studio/study";
import { resolveStudyResults } from "@/lib/studio/study-results-resolve";
import { buildStudyAnalysisEvidence, type EvidenceItem } from "@/lib/studio/study-analysis";
import type { DerivedEvidenceItem } from "@/lib/studio/study-derived-evidence";
import type { SegmentDerivedItem } from "@/lib/studio/study-segments";
import { validateFindingEditorial, selectFindingEvidence, assertPublishable, evidenceView, findingCard, sourceSurveys, type FrozenEvidence, type EvidenceView, type FindingCard } from "@/lib/studio/study-finding";

type Access = "ok" | "forbidden" | "not_found";
export type FindingRow = { id: string; study_id: string; headline: string; commentary: string | null; status: string; origin_type: string; origin_analysis_proposal_id: string | null; created_by: string | null; created_at: string; updated_by: string | null; updated_at: string | null; published_by: string | null; published_at: string | null };
export type EvidenceRow = { id: string; finding_id: string; position: number; evidence_ref: string; evidence_snapshot: FrozenEvidence; created_at: string };
export type Result<T> = { ok: boolean; status: number; data?: T; error?: string };

/** The immutable Analysis-run evidence snapshot — ALL governed classes a proposal may cite. */
type RunSnapshot = { evidence?: EvidenceItem[]; derived?: DerivedEvidenceItem[]; segmentDerived?: SegmentDerivedItem[] };

/** Study-Manage gate (admin/operator) + existence, WITHOUT a full Results resolve. */
async function authoriseStudy(session: AuthedUser, studyId: string): Promise<{ access: Access }> {
  if (!canCurateStudies(session)) return { access: "forbidden" };
  const { data } = await supabaseAdmin.from("studies").select("id").eq("id", studyId).single();
  return { access: data ? "ok" : "not_found" };
}

async function insertEvidence(findingId: string, items: FrozenEvidence[]): Promise<{ ok: boolean; error?: string }> {
  const rows = items.map((snap, i) => ({ finding_id: findingId, position: i, evidence_ref: snap.ref, evidence_snapshot: snap }));
  const { error } = await supabaseAdmin.from("study_finding_evidence").insert(rows);
  return { ok: !error, error: error?.message };
}

/** Product-facing message for an unresolvable-evidence failure. Technical detail (which
 *  refs) is logged server-side; the user sees a clear, non-jargon reason. */
const EVIDENCE_UNRESOLVED_MSG = "This insight can't be added to Findings because some of its supporting evidence is unavailable.";

// ── Create from an ACCEPTED Analysis Proposal ────────────────────────────────
export async function createFindingFromProposal(
  session: AuthedUser, studyId: string, proposalId: string, editorial: { headline?: unknown; commentary?: unknown },
): Promise<Result<{ finding: FindingRow; evidence: EvidenceRow[] }>> {
  const { access } = await authoriseStudy(session, studyId);
  if (access === "forbidden") return { ok: false, status: 403, error: "Forbidden" };
  if (access === "not_found") return { ok: false, status: 404, error: "Study not found" };

  // Proposal + its parent run's IMMUTABLE snapshot (never current Results).
  const { data: prop } = await supabaseAdmin
    .from("study_analysis_proposals")
    .select("id, review_status, evidence_refs, headline, explanation, run:study_analysis_runs!inner(id, study_id, evidence_snapshot)")
    .eq("id", proposalId).single();
  const run = (prop as { run?: { study_id?: string; evidence_snapshot?: RunSnapshot } })?.run;
  if (!prop || run?.study_id !== studyId) return { ok: false, status: 404, error: "Proposal not found" }; // existence-preserving
  // "Add to findings" is one user action: a dismissed proposal can't be added, but a
  // still-'proposed' one is accepted here (audit state retained) rather than forcing a
  // separate Accept step. Only a dismissed proposal is rejected.
  const reviewStatus = (prop as { review_status?: string }).review_status;
  if (reviewStatus === "dismissed") return { ok: false, status: 409, error: "A dismissed proposal cannot be added to findings." };

  // Idempotency as SUCCESS, not error: a repeat click / race returns the existing
  // Finding (the UI already represents the added state, so this rarely fires).
  const { data: existing } = await supabaseAdmin.from("study_findings").select("*").eq("origin_analysis_proposal_id", proposalId).maybeSingle();
  if (existing) {
    const ev = (await supabaseAdmin.from("study_finding_evidence").select("*").eq("finding_id", (existing as FindingRow).id).order("position", { ascending: true })).data as EvidenceRow[];
    return { ok: true, status: 200, data: { finding: existing as FindingRow, evidence: ev ?? [] } };
  }
  if (reviewStatus !== "accepted") {
    await supabaseAdmin.from("study_analysis_proposals").update({ review_status: "accepted", reviewed_by: session.workEmail ?? null, reviewed_at: new Date().toISOString() }).eq("id", proposalId);
  }

  // Freeze EVERY governed class the proposal cites (base + derived + segment) from the
  // run's IMMUTABLE snapshot — never recomputed, never re-resolved against current Results.
  const refs = Array.isArray((prop as { evidence_refs?: unknown }).evidence_refs) ? ((prop as { evidence_refs: string[] }).evidence_refs) : [];
  const sel = selectFindingEvidence(refs, run?.evidence_snapshot);
  if (!sel.ok) {
    if (sel.missing.length) console.warn(`[findings] proposal ${proposalId}: unresolved evidence refs`, sel.missing);
    return { ok: false, status: 422, error: EVIDENCE_UNRESOLVED_MSG };
  }

  // Editorial defaults to the proposal's own wording when the client omits it.
  const ed = validateFindingEditorial({
    headline: (editorial.headline ?? (prop as { headline?: string }).headline),
    commentary: (editorial.commentary ?? (prop as { explanation?: string }).explanation),
  });
  if (!ed.ok) return { ok: false, status: 400, error: ed.error };

  const { data: finding, error: fErr } = await supabaseAdmin.from("study_findings").insert({
    study_id: studyId, headline: ed.headline, commentary: ed.commentary, status: "draft",
    origin_type: "analysis_proposal", origin_analysis_proposal_id: proposalId, created_by: session.workEmail ?? null,
  }).select("*").single();
  if (fErr || !finding) return { ok: false, status: 409, error: fErr?.message ?? "Could not create finding." };

  const ev = await insertEvidence((finding as FindingRow).id, sel.evidence);
  if (!ev.ok) {
    // Compensate: an evidence-less draft must never persist.
    await supabaseAdmin.from("study_findings").delete().eq("id", (finding as FindingRow).id);
    return { ok: false, status: 500, error: `Evidence persistence failed: ${ev.error}` };
  }
  const evidence = (await supabaseAdmin.from("study_finding_evidence").select("*").eq("finding_id", (finding as FindingRow).id).order("position", { ascending: true })).data as EvidenceRow[];
  return { ok: true, status: 201, data: { finding: finding as FindingRow, evidence } };
}

// ── Create a MANUAL Finding from ONE governed Study Result ────────────────────
export async function createManualFinding(
  session: AuthedUser, studyId: string, evidenceRef: string, editorial: { headline?: unknown; commentary?: unknown },
): Promise<Result<{ finding: FindingRow; evidence: EvidenceRow[] }>> {
  const { access, results } = await resolveStudyResults(session, studyId);
  if (access === "forbidden") return { ok: false, status: 403, error: "Forbidden" };
  if (access !== "ok" || !results) return { ok: false, status: 404, error: "Study not found" };

  // Server resolves the governed evidence — a browser-supplied snapshot is never trusted.
  const payload = buildStudyAnalysisEvidence(results.study, results.resultGroups);
  const item = payload.evidence.find((e) => e.ref === evidenceRef);
  if (!item) return { ok: false, status: 422, error: "That result is not a valid, governed study result." };

  const ed = validateFindingEditorial(editorial);
  if (!ed.ok) return { ok: false, status: 400, error: ed.error };

  const { data: finding, error: fErr } = await supabaseAdmin.from("study_findings").insert({
    study_id: studyId, headline: ed.headline, commentary: ed.commentary, status: "draft",
    origin_type: "manual", origin_analysis_proposal_id: null, created_by: session.workEmail ?? null,
  }).select("*").single();
  if (fErr || !finding) return { ok: false, status: 500, error: fErr?.message ?? "Could not create finding." };

  // A manual Finding is from ONE governed BASE result (Results tab); tag + freeze it.
  const ev = await insertEvidence((finding as FindingRow).id, [{ evidenceClass: "base", ...item }]);
  if (!ev.ok) { await supabaseAdmin.from("study_findings").delete().eq("id", (finding as FindingRow).id); return { ok: false, status: 500, error: `Evidence persistence failed: ${ev.error}` }; }
  const evidence = (await supabaseAdmin.from("study_finding_evidence").select("*").eq("finding_id", (finding as FindingRow).id).order("position", { ascending: true })).data as EvidenceRow[];
  return { ok: true, status: 201, data: { finding: finding as FindingRow, evidence } };
}

// ── List / detail ────────────────────────────────────────────────────────────
export async function listFindings(session: AuthedUser, studyId: string): Promise<Result<{ findings: (FindingCard & { sources: { id: string; name: string }[]; headEvidence: EvidenceView | null })[] }>> {
  const { access } = await authoriseStudy(session, studyId);
  if (access === "forbidden") return { ok: false, status: 403, error: "Forbidden" };
  if (access === "not_found") return { ok: false, status: 404, error: "Study not found" };

  const { data: rows } = await supabaseAdmin.from("study_findings").select("*").eq("study_id", studyId).order("created_at", { ascending: false });
  const findings = (rows ?? []) as FindingRow[];
  const ids = findings.map((f) => f.id);
  const { data: evRows } = ids.length
    ? await supabaseAdmin.from("study_finding_evidence").select("finding_id, position, evidence_snapshot").in("finding_id", ids).order("position", { ascending: true })
    : { data: [] as { finding_id: string; position: number; evidence_snapshot: EvidenceItem }[] };
  const byFinding = new Map<string, { position: number; evidence_snapshot: EvidenceItem }[]>();
  for (const e of (evRows ?? []) as { finding_id: string; position: number; evidence_snapshot: EvidenceItem }[]) {
    (byFinding.get(e.finding_id) ?? byFinding.set(e.finding_id, []).get(e.finding_id)!).push(e);
  }
  const out = findings.map((f) => {
    const ev = (byFinding.get(f.id) ?? []).sort((a, b) => a.position - b.position);
    const items = ev.map((e) => e.evidence_snapshot);
    return { ...findingCard(f, ev.length), sources: sourceSurveys(items), headEvidence: ev.length ? evidenceView(ev[0].position, ev[0].evidence_snapshot) : null };
  });
  return { ok: true, status: 200, data: { findings: out } };
}

export async function getFinding(session: AuthedUser, studyId: string, findingId: string): Promise<Result<{ finding: FindingRow; evidence: EvidenceView[]; sources: { id: string; name: string }[] }>> {
  const { access } = await authoriseStudy(session, studyId);
  if (access === "forbidden") return { ok: false, status: 403, error: "Forbidden" };
  if (access === "not_found") return { ok: false, status: 404, error: "Study not found" };

  const { data: finding } = await supabaseAdmin.from("study_findings").select("*").eq("id", findingId).single();
  if (!finding || (finding as FindingRow).study_id !== studyId) return { ok: false, status: 404, error: "Finding not found" };
  const { data: evRows } = await supabaseAdmin.from("study_finding_evidence").select("*").eq("finding_id", findingId).order("position", { ascending: true });
  const rows = (evRows ?? []) as EvidenceRow[];
  return { ok: true, status: 200, data: { finding: finding as FindingRow, evidence: rows.map((r) => evidenceView(r.position, r.evidence_snapshot)), sources: sourceSurveys(rows.map((r) => r.evidence_snapshot)) } };
}

// ── Edit (prose only) / Publish ──────────────────────────────────────────────
export async function editFinding(session: AuthedUser, studyId: string, findingId: string, editorial: { headline?: unknown; commentary?: unknown }): Promise<Result<{ finding: FindingRow }>> {
  const { access } = await authoriseStudy(session, studyId);
  if (access === "forbidden") return { ok: false, status: 403, error: "Forbidden" };
  if (access === "not_found") return { ok: false, status: 404, error: "Study not found" };

  const { data: existing } = await supabaseAdmin.from("study_findings").select("id, study_id").eq("id", findingId).single();
  if (!existing || (existing as { study_id: string }).study_id !== studyId) return { ok: false, status: 404, error: "Finding not found" };

  const ed = validateFindingEditorial(editorial);
  if (!ed.ok) return { ok: false, status: 400, error: ed.error };
  // Prose only — evidence is never touched here (draft OR published; editorial correction).
  const { data: finding, error } = await supabaseAdmin.from("study_findings")
    .update({ headline: ed.headline, commentary: ed.commentary, updated_by: session.workEmail ?? null, updated_at: new Date().toISOString() })
    .eq("id", findingId).select("*").single();
  if (error || !finding) return { ok: false, status: 500, error: error?.message ?? "Update failed." };
  return { ok: true, status: 200, data: { finding: finding as FindingRow } };
}

export async function publishFinding(session: AuthedUser, studyId: string, findingId: string): Promise<Result<{ finding: FindingRow }>> {
  const { access } = await authoriseStudy(session, studyId);
  if (access === "forbidden") return { ok: false, status: 403, error: "Forbidden" };
  if (access === "not_found") return { ok: false, status: 404, error: "Study not found" };

  const { data: finding } = await supabaseAdmin.from("study_findings").select("*").eq("id", findingId).single();
  if (!finding || (finding as FindingRow).study_id !== studyId) return { ok: false, status: 404, error: "Finding not found" };
  const { count } = await supabaseAdmin.from("study_finding_evidence").select("id", { count: "exact", head: true }).eq("finding_id", findingId);
  const pub = assertPublishable(finding as FindingRow, count ?? 0);
  if (!pub.ok) return { ok: false, status: 409, error: pub.error };

  // Publish exactly what the analyst reviewed — NO re-resolution, NO evidence change.
  const { data: updated, error } = await supabaseAdmin.from("study_findings")
    .update({ status: "published", published_by: session.workEmail ?? null, published_at: new Date().toISOString() })
    .eq("id", findingId).eq("status", "draft").select("*").single();
  if (error || !updated) return { ok: false, status: 409, error: error?.message ?? "Could not publish." };
  return { ok: true, status: 200, data: { finding: updated as FindingRow } };
}
