// ── Survey Studio — Survey Analysis service (server-only orchestration) ──────
// One "Generate analysis" for ONE survey = one immutable run over a snapshot of
// governed Survey evidence + the validated proposals/themes/narrative it produced.
// It REUSES the Study Analysis validation firewall + evidence contract + derived/
// segment arithmetic (one firewall, not a copy); only the persistence rows and the
// survey-tuned prompt are survey-specific. The AI is assistance, never authority.
//
// Governance: GENERATION is Manage authority (canManageSurvey — owner of the owning
// org, or admin); Discover CONSUMPTION is entitlement-scoped by its own endpoint.
// Discover NEVER invokes the model — it reads the latest COMPLETED run only, so a
// failed/running regeneration never replaces a previously valid analysis.
//
// Failure semantics mirror Study Analysis: run created 'running' first; provider/
// parse/zero-proposal/persistence failure → 'failed' (previous completed run stays
// current); success → 'completed' with narrative/themes frozen into the snapshot.

import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AuthedUser } from "@/lib/auth-server";
import { canManageSurvey } from "@/lib/studio/collection-health";
import { normaliseQuestions } from "@/lib/studio/survey-results-resolve";
import { resolveDiscoverResults } from "@/lib/studio/dashboard-results";
import { resolveSurveySegmentEvidence } from "@/lib/studio/survey-segments-resolve";
import { buildSegmentDerived } from "@/lib/studio/study-segments";
import { buildSurveyAnalysisEvidence, surveyAnalysisEligibility, type SurveyAnalysisScope } from "@/lib/studio/survey-analysis-evidence";
import { resolveInstrumentSemantics } from "@/lib/studio/scale-templates";
import {
  validateProposals, validateNarrative, validateThemes, canonicalEvidenceString, dedupeProposals,
  ARTIFACT_KINDS, type StudyAnalysisEvidence, type StudyAnalysisProposal, type StudyNarrative, type StudyTheme,
} from "@/lib/studio/study-analysis";
import { selectQualityProposals, hasPrescription, type ResolvedProposalEvidence } from "@/lib/studio/analysis-quality";
import {
  buildSurveyStage1Prompt, buildSurveyStage2Prompt, buildSurveyNarrativeRepairPrompt,
  SURVEY_ANALYSIS_PROVIDER, SURVEY_ANALYSIS_MODEL, SURVEY_STAGE2_PROMPT_VERSION,
} from "@/lib/studio/survey-analysis-prompt";
import { completeJSON } from "@/lib/intelligence/openai";

export type SurveyRunRow = {
  id: string; survey_id: string; status: "running" | "completed" | "failed";
  provider: string | null; model: string | null; prompt_version: string | null;
  evidence_snapshot: unknown; evidence_hash: string | null; proposal_count: number;
  error: string | null; created_by: string | null; created_at: string; completed_at: string | null;
};
export type SurveyProposalRow = {
  id: string; analysis_run_id: string; type: string; headline: string; explanation: string;
  evidence_refs: string[]; review_status: "proposed" | "accepted" | "dismissed"; created_at: string;
};
export type CompleteFn = typeof completeJSON;
export type AnalyseSurveyOutcome = { access: "ok" | "forbidden" | "not_found"; run: SurveyRunRow | null };

const bounded = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 300);

async function readRun(runId: string): Promise<SurveyRunRow | null> {
  const { data } = await supabaseAdmin.from("survey_analysis_runs").select("*").eq("id", runId).single();
  return (data as SurveyRunRow) ?? null;
}
async function failRun(runId: string, error: string): Promise<void> {
  await supabaseAdmin.from("survey_analysis_runs").update({ status: "failed", error, completed_at: new Date().toISOString() }).eq("id", runId);
}

// ── Pure-of-DB run seam (tested with a fake model) ───────────────────────────
// Runs Stage 1 (analyst → proposals) then Stage 2 (synthesis → themes + narrative)
// through the SHARED validators. Throws on zero valid proposals (a failed run).
export async function runSurveyAnalysis(
  payload: StudyAnalysisEvidence, objective: string | null, complete: CompleteFn,
): Promise<{ proposals: StudyAnalysisProposal[]; narrative: StudyNarrative | null; themes: StudyTheme[] }> {
  const allDerived = [...(payload.derived ?? []), ...(payload.segmentDerived ?? [])];

  // Stage 1 — one pass (a ≤5-question survey is small), one retry for transient failure.
  let collected: StudyAnalysisProposal[] = [];
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await complete<unknown>({ prompt: buildSurveyStage1Prompt(payload, objective), model: SURVEY_ANALYSIS_MODEL, temperature: 0.4, maxTokens: 2500 });
      collected = validateProposals(raw, payload.evidence, allDerived).valid;
      lastErr = null;
      break;
    } catch (e) { lastErr = e; }
  }
  const valid = dedupeProposals(collected).kept;

  // ── QUALITY LAYER (ADDITIVE — the firewall has already passed) ──────────────
  // Answers "is this worth showing?", not "is this allowed?". Resolve each valid
  // proposal's GOVERNED refs to server-owned magnitude facts (top %, leader/segment
  // gap in pp, distinct questions), then keep only material, non-generic, non-
  // prescriptive conclusions, ranked strongest-first and capped. No statistics, no
  // benchmarks, no new claims — it only re-reads what the run already computed.
  const evByRef = new Map(payload.evidence.map((e) => [e.ref, e] as const));
  const derByRef = new Map(allDerived.map((d) => [d.ref, d] as const));
  const resolveQ = (p: StudyAnalysisProposal): ResolvedProposalEvidence => {
    let topPct = 0, gapPP = 0, minBase = Infinity;
    const qks = new Set<string>();
    const pctsByQ = new Map<string, number[]>(); // cited base option %s, grouped by question
    for (const r of p.evidenceRefs) {
      const e = evByRef.get(r);
      if (e) {
        const pct = typeof e.percentage === "number" ? Math.round(e.percentage * 100) : null;
        if (pct != null) { topPct = Math.max(topPct, pct); const a = pctsByQ.get(e.canonicalQuestionKey) ?? []; a.push(pct); pctsByQ.set(e.canonicalQuestionKey, a); }
        if (typeof e.base === "number") minBase = Math.min(minBase, e.base);
        if (e.canonicalQuestionKey) qks.add(e.canonicalQuestionKey);
      }
      const d = derByRef.get(r);
      if (d) {
        if (d.canonicalQuestionKey) qks.add(d.canonicalQuestionKey);
        // A leader/spread fact carries the gap directly (pp).
        if ((d.kind === "leader" || d.kind === "spread" || d.kind === "seg_spread") && typeof d.value === "number") gapPP = Math.max(gapPP, Math.abs(d.value));
      }
    }
    // Also derive a within-question lead from two cited options of the SAME question.
    for (const pcts of pctsByQ.values()) {
      if (pcts.length >= 2) { const s = [...pcts].sort((a, b) => b - a); gapPP = Math.max(gapPP, s[0] - s[1]); }
    }
    return { topPct, gapPP, minBase: minBase === Infinity ? 0 : minBase, distinctQuestions: qks.size, refCount: p.evidenceRefs.length };
  };
  const qualified = selectQualityProposals(valid, resolveQ, objective).kept;

  // Disentangle FAILURE from RESTRAINT: a genuine provider/parse error → throw (the
  // caller fails the run). A clean run that simply yields nothing worth a decision-
  // maker's time → COMPLETE with "no strong conclusions" (Results remain the fallback).
  if (qualified.length === 0) {
    if (lastErr) throw new Error(`analyst pass failed: ${bounded(lastErr)}`);
    return { proposals: [], narrative: null, themes: [] };
  }

  // Stage 2 — synthesis over the QUALIFIED body (additive; on failure proposals stand).
  let narrative: StudyNarrative | null = null;
  let themes: StudyTheme[] = [];
  try {
    const sraw = await complete<unknown>({ prompt: buildSurveyStage2Prompt(payload, qualified, objective), model: SURVEY_ANALYSIS_MODEL, temperature: 0.35, maxTokens: 1600 });
    themes = validateThemes(sraw, qualified, payload.evidence, allDerived).themes;
    const nres = validateNarrative(sraw, payload.evidence, allDerived);
    narrative = nres.narrative;
    if (!narrative) {
      const rep = await complete<unknown>({ prompt: buildSurveyNarrativeRepairPrompt(payload, (sraw as { narrative?: unknown })?.narrative ?? null, nres.rejected?.reasons ?? ["no narrative was produced"]), model: SURVEY_ANALYSIS_MODEL, temperature: 0.3, maxTokens: 800 });
      narrative = validateNarrative(rep, payload.evidence, allDerived).narrative;
    }
    // QUALITY: a narrative that prescribes an untested action is not shown (proposals
    // stand; Discover falls back to a theme title or the raw Results).
    if (narrative && hasPrescription(`${narrative.headline}\n${narrative.summary}`)) narrative = null;
  } catch { /* graceful degradation — proposals stand without a narrative/themes */ }

  return { proposals: qualified, narrative, themes };
}

// ── Evidence resolution (owner scope: the survey's whole non-deleted campaign set) ──
// Returns `campaignScope`: the EXACT governed campaign UUID set the evidence was
// generated from (the entitlement key), frozen into the run snapshot so Discover can
// verify a consumer is entitled to the WHOLE scope before showing the synthesis.
async function resolveSurveyEvidence(surveyId: string, surveyRow: { name?: unknown; questions?: unknown; enabled_languages?: unknown; about?: unknown; description?: unknown }): Promise<{ payload: StudyAnalysisEvidence; objective: string | null; campaignScope: string[] } | null> {
  const questions = normaliseQuestions(surveyRow.questions);
  if (questions.length === 0) return null;
  const enabledLanguages = Array.isArray(surveyRow.enabled_languages) ? (surveyRow.enabled_languages as string[]) : [];

  const { data: camps } = await supabaseAdmin.from("campaigns").select("id, campaign_id").eq("survey_id", surveyId).is("deleted_at", null);
  const slugs = (camps ?? []).map((c) => c.campaign_id as string).filter(Boolean);
  const campaignScope = [...new Set((camps ?? []).map((c) => c.id as string).filter(Boolean))].sort();

  const results = await resolveDiscoverResults({ questions, enabledLanguages }, slugs, null);
  const segments = await resolveSurveySegmentEvidence({ questions }, slugs, results.mode, results.displayLanguage);
  const segmentDerived = buildSegmentDerived(surveyId, segments.flatMap((s) => s.questions), "survey");

  const { data: stat } = await supabaseAdmin.from("vw_survey_stats").select("response_count").eq("id", surveyId).maybeSingle();
  const completedResponses = Number(stat?.response_count ?? 0) || 0;

  const about = (surveyRow.about ?? null) as { objective?: unknown } | null;
  const objective = ((typeof about?.objective === "string" && about.objective.trim()) ? about.objective.trim()
    : (typeof surveyRow.description === "string" && surveyRow.description.trim()) ? surveyRow.description.trim() : null);

  const scope: SurveyAnalysisScope = { surveyId, surveyName: (surveyRow.name as string) || "Untitled survey", objective, completedResponses, mode: results.mode };
  // Stage 5D: capture the instrument's governed semantics into the immutable snapshot.
  const semanticsByQuestionId = resolveInstrumentSemantics(questions);
  return { payload: buildSurveyAnalysisEvidence(scope, results.questions, segmentDerived, semanticsByQuestionId), objective, campaignScope };
}

/**
 * Generate (or regenerate) one survey analysis. Manage authority (canManageSurvey);
 * a Regenerate is just another Generate (a NEW run). NEVER called from Discover.
 */
export async function analyseSurvey(session: AuthedUser, surveyId: string, opts?: { complete?: CompleteFn }): Promise<AnalyseSurveyOutcome> {
  const { data: surveyRow } = await supabaseAdmin
    .from("surveys").select("id, name, questions, enabled_languages, organisation_id, about, description").eq("id", surveyId).is("deleted_at", null).single();
  if (!surveyRow) return { access: "not_found", run: null };
  if (!canManageSurvey(session, surveyRow)) return { access: "forbidden", run: null };

  const resolved = await resolveSurveyEvidence(surveyId, surveyRow);
  if (!resolved || resolved.payload.evidence.length === 0) return { access: "ok", run: null }; // nothing to analyse yet
  const { payload, objective, campaignScope } = resolved;
  // Freeze the EXACT governed campaign scope inside the snapshot (immutable, jsonb —
  // no migration). Discover consumption is gated on entitlement to this whole set.
  const snapshotWithScope = { ...payload, campaignScope };

  const evidenceHash = createHash("sha256").update(canonicalEvidenceString(payload)).digest("hex");
  const { data: runRow, error: runErr } = await supabaseAdmin.from("survey_analysis_runs").insert({
    survey_id: surveyId, status: "running",
    provider: SURVEY_ANALYSIS_PROVIDER, model: SURVEY_ANALYSIS_MODEL, prompt_version: SURVEY_STAGE2_PROMPT_VERSION,
    evidence_snapshot: snapshotWithScope, evidence_hash: evidenceHash, created_by: session.workEmail ?? null,
  }).select().single();
  if (runErr || !runRow) throw new Error(`Could not create survey analysis run: ${runErr?.message ?? "unknown"}`);
  const runId = (runRow as SurveyRunRow).id;

  try {
    const { proposals, narrative, themes } = await runSurveyAnalysis(payload, objective, opts?.complete ?? completeJSON);

    // NO STRONG CONCLUSIONS — a clean run that found nothing worth showing COMPLETES
    // (never a "failed" run). Zero findings + a snapshot flag; the survey's Results
    // remain the honest fallback and Discover surfaces no analysis card for it.
    if (proposals.length === 0) {
      await supabaseAdmin.from("survey_analysis_runs")
        .update({ status: "completed", proposal_count: 0, completed_at: new Date().toISOString(), evidence_snapshot: { ...payload, campaignScope, narrative: null, themes: [], proposalPriorities: {}, proposalKinds: {}, noStrongConclusions: true } })
        .eq("id", runId);
      return { access: "ok", run: await readRun(runId) };
    }

    const rows = proposals.map((p) => ({ analysis_run_id: runId, type: p.type, headline: p.headline, explanation: p.explanation, evidence_refs: p.evidenceRefs, review_status: "proposed" as const }));
    const { data: propRows, error: propErr } = await supabaseAdmin.from("survey_analysis_proposals").insert(rows).select();
    if (propErr || !propRows) { await failRun(runId, `Proposal persistence failed: ${propErr?.message ?? "unknown"}`); return { access: "ok", run: await readRun(runId) }; }

    const rowIds = (propRows as SurveyProposalRow[]).map((r) => r.id);
    const proposalPriorities: Record<string, string> = {};
    const proposalKinds: Record<string, string> = {};
    (propRows as SurveyProposalRow[]).forEach((row, i) => {
      proposalPriorities[row.id] = proposals[i]?.priority ?? "key";
      proposalKinds[row.id] = proposals[i]?.displayType ?? proposals[i]?.type ?? "observation";
    });
    const snapshotThemes = themes.map((t) => ({
      id: t.id, title: t.title, interpretation: t.interpretation, importance: t.importance, relationToObjective: t.relationToObjective,
      proposalIds: t.proposalIndexes.map((i) => rowIds[i]).filter(Boolean), evidenceRefs: t.evidenceRefs,
    })).filter((t) => t.proposalIds.length > 0);

    await supabaseAdmin.from("survey_analysis_runs")
      .update({ status: "completed", proposal_count: propRows.length, completed_at: new Date().toISOString(), evidence_snapshot: { ...payload, campaignScope, narrative, themes: snapshotThemes, proposalPriorities, proposalKinds } })
      .eq("id", runId);
    return { access: "ok", run: await readRun(runId) };
  } catch (err) {
    await failRun(runId, bounded(err));
    return { access: "ok", run: await readRun(runId) };
  }
}

// ── Current-run selection (pure, tested) ─────────────────────────────────────
/** The CURRENT analysis = the latest COMPLETED run. A later failed/running run
 *  never becomes current (rows are pre-sorted created_at DESC). */
export function selectCurrentRun<T extends { status: string }>(runsNewestFirst: T[]): T | null {
  return runsNewestFirst.find((r) => r.status === "completed") ?? null;
}

export type AnalysisFinding = {
  id: string;
  displayType: string;
  priority: "key" | "supporting";
  headline: string;
  explanation: string;
  /** Server-resolved from the frozen evidence the model cited — never model prose. */
  supportingQuestions: string[];
  base: number | null;
};
export type SurveyAnalysisView = {
  narrative: StudyNarrative | null;
  themes: (Omit<StudyTheme, "proposalIndexes"> & { proposalIds: string[] })[];
  findings: AnalysisFinding[];
  generatedAt: string | null;
  /** A COMPLETED run that found nothing worth a confident conclusion (findings empty
   *  by design). The UI shows a restrained "no strong conclusions" state and points
   *  to Results; Discover surfaces no analysis card (no narrative/theme headline). */
  noStrongConclusions: boolean;
};

type SnapEvidence = { ref: string; question?: string; base?: number };

// ── Entitlement scope-matching (the security rule; pure, tested) ─────────────
// A persisted synthesis may be shown ONLY when the caller is entitled to the ENTIRE
// governed campaign scope it was generated from. Superset/exact = visible; subset,
// partial-overlap, or unrelated = hidden (fail closed). An unrestricted operator
// sees everything. Missing/empty frozen scope is unverifiable → hidden.
export function analysisScopeVisible(input: { runCampaignScope: string[] | null | undefined; unrestricted: boolean; authorisedCampaignIds: string[] }): boolean {
  if (input.unrestricted) return true;
  const scope = input.runCampaignScope;
  if (!scope || scope.length === 0) return false;
  const authorised = new Set(input.authorisedCampaignIds);
  return scope.every((id) => authorised.has(id));
}

export type AnalysisEntitlement = { unrestricted: boolean; authorisedCampaignIds: string[] };

/** The current (latest completed) analysis for a survey, or null. The caller MUST
 *  pass its governed campaign entitlement: the synthesis is returned ONLY when the
 *  caller is entitled to the WHOLE campaign scope the analysis was generated from —
 *  otherwise null (Discover then shows the deterministic findings for the caller's
 *  own scope). No model call. Nothing about a hidden analysis is disclosed. */
export async function getCurrentSurveyAnalysis(surveyId: string, entitlement: AnalysisEntitlement): Promise<SurveyAnalysisView | null> {
  const { data: runs } = await supabaseAdmin
    .from("survey_analysis_runs")
    .select("id, status, evidence_snapshot, completed_at, created_at")
    .eq("survey_id", surveyId).order("created_at", { ascending: false }).limit(10);
  const current = selectCurrentRun((runs ?? []) as { id: string; status: string; evidence_snapshot: unknown; completed_at: string | null }[]);
  if (!current) return null;

  // ENTITLEMENT GATE — before ANY of the analysis (narrative/themes/findings/
  // provenance) is read out, verify the caller is entitled to its whole scope.
  const scopeSnap = (current.evidence_snapshot ?? {}) as { campaignScope?: string[] };
  if (!analysisScopeVisible({ runCampaignScope: scopeSnap.campaignScope, unrestricted: entitlement.unrestricted, authorisedCampaignIds: entitlement.authorisedCampaignIds })) {
    return null;
  }

  const { data: props } = await supabaseAdmin.from("survey_analysis_proposals").select("*").eq("analysis_run_id", current.id).order("created_at", { ascending: true });
  const snap = (current.evidence_snapshot ?? {}) as {
    narrative?: StudyNarrative | null; themes?: (Omit<StudyTheme, "proposalIndexes"> & { proposalIds: string[] })[];
    proposalPriorities?: Record<string, string>; proposalKinds?: Record<string, string>;
    evidence?: SnapEvidence[]; noStrongConclusions?: boolean;
  };
  const priorities = snap.proposalPriorities ?? {};
  const kinds = snap.proposalKinds ?? {};
  // Server-truth resolution: a ref → its frozen question + base (base evidence only).
  const byRef = new Map((snap.evidence ?? []).map((e) => [e.ref, e]));
  const resolveFinding = (refs: string[]): { supportingQuestions: string[]; base: number | null } => {
    const qs = new Set<string>();
    let base: number | null = null;
    for (const r of refs) {
      const e = byRef.get(r);
      if (e?.question) qs.add(e.question);
      if (typeof e?.base === "number") base = base == null ? e.base : Math.min(base, e.base);
    }
    return { supportingQuestions: [...qs], base };
  };
  const findings: AnalysisFinding[] = (props ?? []).map((p) => {
    const refs = Array.isArray(p.evidence_refs) ? (p.evidence_refs as string[]) : [];
    const { supportingQuestions, base } = resolveFinding(refs);
    return {
      id: p.id as string,
      displayType: (ARTIFACT_KINDS as readonly string[]).includes(kinds[p.id as string]) ? kinds[p.id as string] : (p.type as string),
      priority: (priorities[p.id as string] === "supporting" ? "supporting" : "key") as "key" | "supporting",
      headline: p.headline as string,
      explanation: p.explanation as string,
      supportingQuestions, base,
    };
  });
  const validIds = new Set(findings.map((f) => f.id));
  const themes = (snap.themes ?? []).map((t) => ({ ...t, proposalIds: (t.proposalIds ?? []).filter((id) => validIds.has(id)) })).filter((t) => t.proposalIds.length > 0);
  return { narrative: snap.narrative ?? null, themes, findings, generatedAt: (current.completed_at as string | null) ?? null, noStrongConclusions: snap.noStrongConclusions === true };
}

/** Lightweight status for the Manage control (latest run of ANY status + current). */
export async function getSurveyAnalysisMeta(surveyId: string): Promise<{ currentGeneratedAt: string | null; lastStatus: "running" | "completed" | "failed" | null; lastAt: string | null }> {
  const { data: runs } = await supabaseAdmin
    .from("survey_analysis_runs").select("status, created_at, completed_at").eq("survey_id", surveyId).order("created_at", { ascending: false }).limit(10);
  const list = (runs ?? []) as { status: "running" | "completed" | "failed"; created_at: string; completed_at: string | null }[];
  const current = selectCurrentRun(list);
  return { currentGeneratedAt: current?.completed_at ?? null, lastStatus: list[0]?.status ?? null, lastAt: list[0]?.created_at ?? null };
}

/**
 * Authoritative analysis eligibility — the SAME gate the generator applies
 * (a question with answered base ≥ ANALYSIS_MIN_BASE via the governed results
 * resolver). Used to render truthful enabled/disabled Analyse actions. NOT a
 * live/closed rule — a live survey with enough evidence is eligible (its Discover
 * findings are simply "Emerging"). No model call.
 */
export async function resolveSurveyAnalysisEligibility(surveyId: string): Promise<{ eligible: boolean; reason: string | null }> {
  const { data: surveyRow } = await supabaseAdmin.from("surveys").select("questions, enabled_languages").eq("id", surveyId).is("deleted_at", null).single();
  if (!surveyRow) return { eligible: false, reason: "This survey could not be found." };
  const questions = normaliseQuestions((surveyRow as { questions?: unknown }).questions);
  if (questions.length === 0) return { eligible: false, reason: "This survey has no questions yet." };
  const enabledLanguages = Array.isArray(surveyRow.enabled_languages) ? (surveyRow.enabled_languages as string[]) : [];
  const { data: camps } = await supabaseAdmin.from("campaigns").select("campaign_id").eq("survey_id", surveyId).is("deleted_at", null);
  const slugs = (camps ?? []).map((c) => c.campaign_id as string).filter(Boolean);
  const results = await resolveDiscoverResults({ questions, enabledLanguages }, slugs, null);
  // The max answered base (always Q1's) → the SHARED eligibility predicate.
  const maxBase = results.questions.reduce((m, q) => Math.max(m, q.base), 0);
  return surveyAnalysisEligibility(maxBase);
}
