// ── Survey Studio — Study Analysis service (server-only orchestration) ───────
// One "Analyse study" = one immutable run over a snapshot of governed Study evidence
// + the reviewable AI proposals it produced. The AI is assistance, never authority:
// numbers come from the evidence snapshot; a proposal stores interpretation + refs.
//
// Failure semantics (explicit):
//   • run created as 'running' BEFORE the provider call (audit of every attempt)
//   • provider/parse failure        → run 'failed', no proposals
//   • zero valid proposals          → run 'failed', no misleading partial set
//   • proposal persistence failure  → run 'failed', run NEVER becomes 'completed'
//   • valid proposals persisted OK  → run 'completed'
//   • a rerun ALWAYS creates a NEW run (old runs are immutable history)
// Server-only (supabaseAdmin + node:crypto + the OpenAI primitive).

import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AuthedUser } from "@/lib/auth-server";
import { resolveStudyResults } from "@/lib/studio/study-results-resolve";
import { buildStudyAnalysisEvidence, validateProposals, validateNarrative, validateThemes, canonicalEvidenceString, dedupeProposals, ARTIFACT_KINDS, type StudyNarrative, type StudyTheme } from "@/lib/studio/study-analysis";
import { buildNarrativeRepairPrompt, buildStage1Prompt, buildStage2Prompt, STAGE2_PROMPT_VERSION } from "@/lib/studio/study-analysis-prompt";
import { chooseAnalysisMode, batchResultGroups } from "@/lib/studio/study-analysis-stage";
import { resolveStudySegments } from "@/lib/studio/study-segments-resolve";
import { buildSegmentDerived } from "@/lib/studio/study-segments";
import type { StudyAnalysisProposal } from "@/lib/studio/study-analysis";
import { completeJSON } from "@/lib/intelligence/openai";

export const STUDY_ANALYSIS_PROVIDER = "openai";
export const STUDY_ANALYSIS_MODEL = "gpt-4o";

export type RunRow = {
  id: string; study_id: string; status: "running" | "completed" | "failed";
  provider: string | null; model: string | null; prompt_version: string | null;
  evidence_snapshot: unknown; evidence_hash: string | null; proposal_count: number;
  error: string | null; created_by: string | null; created_at: string; completed_at: string | null;
};
export type ProposalRow = {
  id: string; analysis_run_id: string; type: string; headline: string; explanation: string;
  evidence_refs: string[]; review_status: "proposed" | "accepted" | "dismissed";
  created_at: string; reviewed_by: string | null; reviewed_at: string | null; updated_by: string | null; updated_at: string | null;
};

export type AnalyseOutcome = { access: "ok" | "forbidden" | "not_found"; run: RunRow | null; proposals: ProposalRow[] };

/** Injectable completion fn (tests pass a fake; production uses the OpenAI primitive). */
export type CompleteFn = typeof completeJSON;

const bounded = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 300);

async function readRun(runId: string): Promise<RunRow | null> {
  const { data } = await supabaseAdmin.from("study_analysis_runs").select("*").eq("id", runId).single();
  return (data as RunRow) ?? null;
}
async function failRun(runId: string, error: string): Promise<void> {
  await supabaseAdmin.from("study_analysis_runs").update({ status: "failed", error, completed_at: new Date().toISOString() }).eq("id", runId);
}

/**
 * Run one analysis for a Study. Access is Study-MANAGE (admin/operator) via
 * resolveStudyResults (which enforces canCurateStudies — NOT data entitlement).
 */
export async function analyseStudy(session: AuthedUser, studyId: string, opts?: { complete?: CompleteFn }): Promise<AnalyseOutcome> {
  const { access, results } = await resolveStudyResults(session, studyId);
  if (access !== "ok" || !results) return { access, run: null, proposals: [] };

  // AUDIENCE segmentation (additive, bounded, base-reconciling; [] when unavailable).
  const segmentQuestions = await resolveStudySegments(results.surveys, results.resultGroups);
  const segmentDerived = buildSegmentDerived(results.study.id, segmentQuestions);

  // Capture the exact constituent Survey ids as the run's membership context (for
  // set-based staleness — see getLatestStudyAnalysis).
  const payload = buildStudyAnalysisEvidence({ ...results.study, surveyIds: results.surveys.map((s) => s.surveyId) }, results.resultGroups, segmentDerived);
  // Segment + base derived are both citable evidence for validation.
  const allDerived = [...payload.derived, ...payload.segmentDerived];
  const evidenceHash = createHash("sha256").update(canonicalEvidenceString(payload)).digest("hex");
  const objective = payload.study.objective;
  // SAME analytical METHOD for every study — a broad ANALYST pass (coverage) then a
  // PROJECTION pass (verify + organise). Study SIZE only changes how coverage is BATCHED
  // (small = one batch), never the analytical depth. chooseAnalysisMode is metadata only.
  const mode = chooseAnalysisMode(payload);

  // Create the run FIRST (status running) — every attempt is audited, even a failure.
  const { data: runRow, error: runErr } = await supabaseAdmin.from("study_analysis_runs").insert({
    study_id: studyId, status: "running",
    provider: STUDY_ANALYSIS_PROVIDER, model: STUDY_ANALYSIS_MODEL, prompt_version: STAGE2_PROMPT_VERSION,
    evidence_snapshot: payload, evidence_hash: evidenceHash, created_by: session.workEmail ?? null,
  }).select().single();
  if (runErr || !runRow) throw new Error(`Could not create analysis run: ${runErr?.message ?? "unknown"}`);
  const runId = (runRow as RunRow).id;

  try {
    const complete = opts?.complete ?? completeJSON;

    // ── ANALYST PASS(ES): the model produces the PROPOSALS here (broad breadth), over
    //    bounded batches (small study = 1 batch). Verification is deterministic. ──
    const batched = batchResultGroups(results.resultGroups);
    if (!batched.ok) { await failRun(runId, batched.error ?? "Study too large for analysis."); return { access: "ok", run: await readRun(runId), proposals: [] }; }
    const batchCount = batched.batches.length;
    // Coverage determinism: a SINGLE stochastic analyst pass under-covers a small study on
    // unlucky runs (the FedEx "4 proposals" case). Run the analyst role TWICE for compact
    // studies (≤2 batches) and UNION the distinct proposals — this raises the coverage floor
    // and cuts run-to-run variance WITHOUT forcing a count. Larger (staged) studies already
    // aggregate many batch calls, so one pass per batch is sufficient. The two passes also
    // serve as each other's retry: a batch fails only if EVERY pass for it errors.
    const analystPasses = batchCount <= 2 ? 2 : 1;
    const collected: StudyAnalysisProposal[] = [];
    for (const batch of batched.batches) {
      let batchCovered = false;
      let lastErr: unknown = null;
      for (let pass = 1; pass <= analystPasses; pass++) {
        // Each pass gets one controlled retry (transient-failure resilience). A successful
        // pass breaks; the extra pass (small studies) adds coverage, not just resilience.
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const cRaw = await complete<unknown>({ prompt: buildStage1Prompt(payload, batch, objective), model: STUDY_ANALYSIS_MODEL, temperature: 0.45, maxTokens: 4000 });
            collected.push(...validateProposals(cRaw, payload.evidence, allDerived).valid);
            batchCovered = true;
            break;
          } catch (e) { lastErr = e; }
        }
      }
      if (!batchCovered) {
        // Every attempt for a batch failed → INCOMPLETE coverage — never a misleading
        // "completed" run. Fail rather than analyse a partial study.
        await failRun(runId, `A broad-review batch could not be analysed (${bounded(lastErr)}); analysis not completed to avoid incomplete coverage.`);
        return { access: "ok", run: await readRun(runId), proposals: [] };
      }
    }
    // Cross-batch / cross-pass union: drop exact + near-identical RESTATEMENTS of the same
    // avenue (the 2nd analyst pass restates some avenues in different words), while keeping
    // distinct interpretations. Shared evidence is never a dedupe signal.
    const valid = dedupeProposals(collected).kept;

    // Zero valid proposals → a failed run, never a misleading empty "completed" set.
    if (valid.length === 0) {
      await failRun(runId, "No valid proposals were produced from the evidence.");
      return { access: "ok", run: await readRun(runId), proposals: [] };
    }

    // ── SYNTHESIS PASS: ONE call that ORGANISES the verified proposals into THEMES and
    //    writes the theme-driven executive narrative. It never regenerates or reduces the
    //    proposal set. Themes/narrative are additive: if either fails, the run still
    //    completes with the proposal-level experience (graceful degradation). ──
    let narrative: StudyNarrative | null = null;
    let themes: StudyTheme[] = [];
    try {
      const sraw = await complete<unknown>({ prompt: buildStage2Prompt(payload, valid, objective), model: STUDY_ANALYSIS_MODEL, temperature: 0.35, maxTokens: 2200 });
      themes = validateThemes(sraw, valid, payload.evidence, allDerived).themes;
      const nres = validateNarrative(sraw, payload.evidence, allDerived);
      narrative = nres.narrative;
      if (!narrative) { // ONE narrative-only repair — same evidence, never touches proposals/themes
        const repaired = await complete<unknown>({ prompt: buildNarrativeRepairPrompt(payload, (sraw as { narrative?: unknown })?.narrative ?? null, nres.rejected?.reasons ?? ["no narrative was produced"]), model: STUDY_ANALYSIS_MODEL, temperature: 0.3, maxTokens: 1000 });
        narrative = validateNarrative(repaired, payload.evidence, allDerived).narrative;
      }
    } catch { /* graceful degradation — proposals still stand without a narrative/themes */ }

    const rows = valid.map((p) => ({
      analysis_run_id: runId, type: p.type, headline: p.headline, explanation: p.explanation,
      evidence_refs: p.evidenceRefs, review_status: "proposed" as const,
    }));
    const { data: propRows, error: propErr } = await supabaseAdmin.from("study_analysis_proposals").insert(rows).select();
    if (propErr || !propRows) {
      // Persistence failure → the run must NOT become 'completed'.
      await failRun(runId, `Proposal persistence failed: ${propErr?.message ?? "unknown"}`);
      return { access: "ok", run: await readRun(runId), proposals: [] };
    }

    // Presentation priority (key/supporting) is not a schema field — map each persisted
    // proposal id → its priority in the snapshot (proposals inserted in `valid` order).
    const proposalPriorities: Record<string, string> = {};
    // Richer analytical kind (pattern/tension/implication) is presentation-only — persisted
    // in the snapshot alongside priority, NOT in the DB `type` column (no migration).
    const proposalKinds: Record<string, string> = {};
    (propRows as ProposalRow[]).forEach((row, i) => {
      proposalPriorities[row.id] = valid[i]?.priority ?? "key";
      proposalKinds[row.id] = valid[i]?.displayType ?? valid[i]?.type ?? "observation";
    });

    // Themes reference proposals by validated INDEX; propRows are inserted in `valid` order,
    // so map each theme's indexes → the persisted proposal ids. A theme that ends up with no
    // persisted member is dropped (never shown unsupported).
    const rowIds = (propRows as ProposalRow[]).map((r) => r.id);
    const snapshotThemes = themes.map((t) => ({
      id: t.id, title: t.title, interpretation: t.interpretation, importance: t.importance, relationToObjective: t.relationToObjective,
      proposalIds: t.proposalIndexes.map((i) => rowIds[i]).filter(Boolean),
      evidenceRefs: t.evidenceRefs,
    })).filter((t) => t.proposalIds.length > 0);

    // Freeze the run: the snapshot holds the immutable INPUT (study+evidence, hashed)
    // PLUS this run's OUTPUT — narrative, analysis mode/batch count, (staged) the
    // validated Stage-1 candidates, and the proposal priorities (auditable research
    // artifacts, NOT chain-of-thought).
    await supabaseAdmin.from("study_analysis_runs")
      .update({ status: "completed", proposal_count: propRows.length, completed_at: new Date().toISOString(), evidence_snapshot: { ...payload, narrative, themes: snapshotThemes, analysisMode: mode, batchCount, proposalPriorities, proposalKinds } })
      .eq("id", runId);
    return { access: "ok", run: await readRun(runId), proposals: propRows as ProposalRow[] };
  } catch (err) {
    // Provider/parse/validation error → failed run, no proposals.
    await failRun(runId, bounded(err));
    return { access: "ok", run: await readRun(runId), proposals: [] };
  }
}

/** Latest run for a Study + its proposals, plus bounded metadata of prior runs. */
export async function getLatestStudyAnalysis(session: AuthedUser, studyId: string): Promise<{
  access: "ok" | "forbidden" | "not_found"; run: RunRow | null; proposals: (ProposalRow & { findingId: string | null; priority: "key" | "supporting" })[];
  /** The Study-level "what the research says" narrative from the latest completed run. */
  narrative: StudyNarrative | null;
  /** The analytical THEMES that organise the proposals (Level 3), from the frozen snapshot.
   *  Each references persisted proposal ids + a server-computed evidence union. */
  themes: (Omit<StudyTheme, "proposalIndexes"> & { proposalIds: string[] })[];
  /** Deterministic coverage of the latest run (from the frozen snapshot — NOT the model,
   *  NOT chain-of-thought): how much evidence the analysis actually reviewed. */
  coverage: { surveys: number; questions: number; evidencePoints: number } | null;
  history: { id: string; status: string; created_at: string; proposal_count: number; evidence_hash: string | null }[];
  /** Whether the latest completed analysis was produced under a since-changed context.
   *  The DATA is not stale — the INTERPRETATION is. null when there is no completed run. */
  stale: { objectiveChanged: boolean; membershipChanged: boolean } | null;
}> {
  // Reuse the Study-Manage authorisation (and existence) via resolveStudyResults.
  const { access, results } = await resolveStudyResults(session, studyId);
  if (access !== "ok") return { access, run: null, proposals: [], narrative: null, themes: [], coverage: null, history: [], stale: null };

  const { data: runs } = await supabaseAdmin.from("study_analysis_runs")
    .select("id, study_id, status, provider, model, prompt_version, evidence_snapshot, evidence_hash, proposal_count, error, created_by, created_at, completed_at")
    .eq("study_id", studyId).order("created_at", { ascending: false }).limit(20);
  const list = (runs ?? []) as RunRow[];
  const latest = list[0] ?? null;
  const rawProposals = latest
    ? (((await supabaseAdmin.from("study_analysis_proposals").select("*").eq("analysis_run_id", latest.id).order("created_at", { ascending: true })).data ?? []) as ProposalRow[])
    : [];
  // Proactively resolve which proposals already have a Finding, so the UI never offers
  // "Add to findings" for one that's already added (no post-click "already exists" error).
  const ids = rawProposals.map((p) => p.id);
  const { data: findingRows } = ids.length
    ? await supabaseAdmin.from("study_findings").select("id, origin_analysis_proposal_id").in("origin_analysis_proposal_id", ids)
    : { data: [] as { id: string; origin_analysis_proposal_id: string }[] };
  const findingByProposal = new Map((findingRows ?? []).map((f) => [f.origin_analysis_proposal_id as string, f.id as string]));
  const snapMeta = (latest?.evidence_snapshot as { proposalPriorities?: Record<string, string>; proposalKinds?: Record<string, string> } | null);
  const priorities = snapMeta?.proposalPriorities ?? {};
  const kinds = snapMeta?.proposalKinds ?? {};
  const proposals = rawProposals.map((p) => ({
    ...p,
    findingId: findingByProposal.get(p.id) ?? null,
    priority: (priorities[p.id] === "supporting" ? "supporting" : "key") as "key" | "supporting",
    // Richer analytical kind for display (falls back to the stored enum for pre-refactor runs).
    displayType: (ARTIFACT_KINDS as readonly string[]).includes(kinds[p.id]) ? kinds[p.id] : p.type,
  }));
  const history = list.map((r) => ({ id: r.id, status: r.status, created_at: r.created_at, proposal_count: r.proposal_count, evidence_hash: r.evidence_hash }));

  // Staleness: compare the latest COMPLETED run's captured context (objective +
  // constituent-survey ID SET, frozen in its evidence_snapshot) to the study's current
  // context. Membership uses the ID set (order-independent), so [A,B] → [A,C] is caught
  // even though the count stays 2. The DATA has not changed — the INTERPRETATION has.
  // Existing findings are frozen and untouched either way.
  const snap = (latest?.evidence_snapshot ?? null) as { study?: { objective?: string | null; surveyCount?: number; surveyIds?: string[] }; evidence?: { canonicalQuestionKey?: string }[]; narrative?: StudyNarrative | null; themes?: (Omit<StudyTheme, "proposalIndexes"> & { proposalIds: string[] })[] } | null;
  let stale: { objectiveChanged: boolean; membershipChanged: boolean } | null = null;
  if (latest && latest.status === "completed" && results) {
    const snapObjective = (snap?.study?.objective ?? "") as string;
    const curObjective = (results.study.objective ?? "") as string;
    const snapIds = [...(snap?.study?.surveyIds ?? [])].map(String).sort();
    const curIds = results.surveys.map((s) => String(s.surveyId)).sort();
    const membershipChanged = snapIds.length
      ? (snapIds.length !== curIds.length || snapIds.some((id, i) => id !== curIds[i]))
      : (snap?.study?.surveyCount ?? results.study.surveyCount) !== results.study.surveyCount; // pre-v5 run fallback
    stale = { objectiveChanged: snapObjective.trim() !== curObjective.trim(), membershipChanged };
  }
  const completed = !!(latest && latest.status === "completed");
  const narrative = completed ? (snap?.narrative ?? null) : null;
  // Themes only include proposals that still exist in this run (defensive against any drift).
  const validProposalIds = new Set(rawProposals.map((p) => p.id));
  const themes = completed
    ? (snap?.themes ?? []).map((t) => ({ ...t, proposalIds: (t.proposalIds ?? []).filter((id) => validProposalIds.has(id)) })).filter((t) => t.proposalIds.length > 0)
    : [];
  const coverage = completed && snap
    ? { surveys: snap.study?.surveyIds?.length ?? snap.study?.surveyCount ?? 0, questions: new Set((snap.evidence ?? []).map((e) => e.canonicalQuestionKey)).size, evidencePoints: (snap.evidence ?? []).length }
    : null;
  return { access: "ok", run: latest, proposals, narrative, themes, coverage, history, stale };
}

export type ProposalAction = { action: "edit"; headline?: string; explanation?: string } | { action: "accept" } | { action: "dismiss" };

/**
 * Review a proposal. Only editorial prose (headline/explanation) is mutable; type,
 * evidence_refs, run linkage and numbers are immutable. Accept/dismiss record the
 * reviewer + time. Authorises via the parent run's Study (path integrity enforced).
 */
export async function reviewProposal(session: AuthedUser, studyId: string, proposalId: string, action: ProposalAction): Promise<{ ok: boolean; status: number; proposal?: ProposalRow; error?: string }> {
  const { access } = await resolveStudyResults(session, studyId);
  if (access === "forbidden") return { ok: false, status: 403, error: "Forbidden" };
  if (access === "not_found") return { ok: false, status: 404, error: "Study not found" };

  // Load the proposal + its run; the run MUST belong to this Study (existence-preserving).
  const { data: prop } = await supabaseAdmin.from("study_analysis_proposals").select("*, run:study_analysis_runs!inner(study_id)").eq("id", proposalId).single();
  if (!prop || (prop as { run?: { study_id?: string } }).run?.study_id !== studyId) return { ok: false, status: 404, error: "Proposal not found" };

  const now = new Date().toISOString();
  let patch: Record<string, unknown>;
  if (action.action === "accept") patch = { review_status: "accepted", reviewed_by: session.workEmail ?? null, reviewed_at: now };
  else if (action.action === "dismiss") patch = { review_status: "dismissed", reviewed_by: session.workEmail ?? null, reviewed_at: now };
  else {
    // Editorial edit — prose only; ignore any other client-supplied fields entirely.
    patch = {};
    if (typeof action.headline === "string" && action.headline.trim()) patch.headline = action.headline.trim();
    if (typeof action.explanation === "string" && action.explanation.trim()) patch.explanation = action.explanation.trim();
    if (Object.keys(patch).length === 0) return { ok: false, status: 400, error: "Nothing to edit" };
    patch.updated_by = session.workEmail ?? null;
    patch.updated_at = now;
  }

  const { data: updated, error } = await supabaseAdmin.from("study_analysis_proposals").update(patch).eq("id", proposalId).select("*").single();
  if (error || !updated) return { ok: false, status: 500, error: error?.message ?? "Update failed" };
  return { ok: true, status: 200, proposal: updated as ProposalRow };
}
