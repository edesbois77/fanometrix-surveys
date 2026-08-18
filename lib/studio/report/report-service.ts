// ── Survey Studio — Report service (server-only orchestration) ───────────────
// Turns human-approved Findings into a verified, renderable framework ReportConfig and
// persists it as a DRAFT study_reports row. NO re-analysis: composition over approved
// Findings (claims) + their frozen governed evidence + the pinned Analysis run (proof
// distributions + Study Story/themes as context). Composer output is deterministically
// VERIFIED before persistence; nothing partial is ever saved.

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AuthedUser } from "@/lib/auth-server";
import { canCurateStudies } from "@/lib/studio/study";
import { resolveStudyResults } from "@/lib/studio/study-results-resolve";
import { getLatestStudyAnalysis } from "@/lib/studio/study-analysis-service";
import { evidenceView } from "@/lib/studio/study-finding";
import { completeJSON } from "@/lib/intelligence/openai";
import {
  reportReadiness, governedNumbersOf, verifyComposedReport, buildSegmentComparison,
  type ReportComposerInput, type ReportInputFinding, type ReportGovernance, type ComparisonSpec, type ComposedReport, type Readiness,
} from "@/lib/studio/report/report-domain";
import { buildStudyReportDocument, type StudyReportDocument } from "@/lib/studio/report/report-document";
import { buildExecutivePage, type ExecutiveReportDocument } from "@/lib/studio/report/executive-page";
import { composeExecutivePlan } from "@/lib/studio/report/executive-compose";
import { composeEvidencePlan } from "@/lib/studio/report/evidence-compose";
import { buildEvidencePage, availableEvidence, describeStories, type EvidenceReportDocument } from "@/lib/studio/report/evidence-page";
import { resolveVisualEvidence, primaryDistribution } from "@/lib/studio/report/visual-evidence";
import { assessRichness } from "@/lib/studio/report/richness";
import { buildReportComposerPrompt, REPORT_COMPOSER_VERSION } from "@/lib/studio/report/report-compose-prompt";

export type Result<T> = { ok: boolean; status: number; data?: T; error?: string };
export type CompleteFn = typeof completeJSON;
export type ReportRow = { id: string; study_id: string; title: string; report_type: string; status: string; editorial_brief: string | null; config: StudyReportDocument; source_finding_ids: string[]; analysis_run_id: string | null; created_at: string; updated_at: string };

async function authorise(session: AuthedUser, studyId: string): Promise<"ok" | "forbidden" | "not_found"> {
  if (!canCurateStudies(session)) return "forbidden";
  const { data } = await supabaseAdmin.from("studies").select("id").eq("id", studyId).single();
  return data ? "ok" : "not_found";
}

/**
 * Build the governed composer input (+ server-side governance sidecar) for a Study from its
 * approved Findings and pinned Analysis run. Read-only. `selected` limits to chosen findings.
 */
export async function resolveReportInput(
  session: AuthedUser, studyId: string, selected?: string[], editorialBrief?: string | null,
): Promise<{ access: "ok" | "forbidden" | "not_found"; input?: ReportComposerInput; governance?: ReportGovernance; pinnedRunId?: string | null; sourceFindingIds?: string[] }> {
  const access = await authorise(session, studyId);
  if (access !== "ok") return { access };
  const { results } = await resolveStudyResults(session, studyId);
  if (!results) return { access: "not_found" };

  // Approved Findings (draft + published) + their frozen evidence.
  const { data: findingRows } = await supabaseAdmin.from("study_findings").select("id, headline, commentary").eq("study_id", studyId).order("created_at", { ascending: true });
  let findings = (findingRows ?? []) as { id: string; headline: string; commentary: string | null }[];
  if (selected?.length) { const set = new Set(selected); findings = findings.filter((f) => set.has(f.id)); }
  const ids = findings.map((f) => f.id);
  const { data: evRows } = ids.length ? await supabaseAdmin.from("study_finding_evidence").select("finding_id, position, evidence_snapshot").in("finding_id", ids).order("position", { ascending: true }) : { data: [] as { finding_id: string; position: number; evidence_snapshot: Record<string, unknown> }[] };
  const evByFinding = new Map<string, { position: number; evidence_snapshot: Record<string, unknown> }[]>();
  for (const e of (evRows ?? []) as { finding_id: string; position: number; evidence_snapshot: Record<string, unknown> }[]) (evByFinding.get(e.finding_id) ?? evByFinding.set(e.finding_id, []).get(e.finding_id)!).push(e);

  const segmentComparisons = new Map<string, ComparisonSpec>();
  const inputFindings: ReportInputFinding[] = findings.map((f) => {
    const rows = (evByFinding.get(f.id) ?? []).sort((a, b) => a.position - b.position);
    // Build a GOVERNED audience comparison from the first segment fact whose frozen `detail`
    // carries comparable per-group values (never inferred). Falls back to prose otherwise.
    for (const e of rows) {
      const snap = e.evidence_snapshot as { evidenceClass?: string; kind?: string; dimension?: string; detail?: Record<string, unknown> };
      if ((snap.evidenceClass === "segment" || snap.dimension) && snap.kind && snap.detail) {
        const spec = buildSegmentComparison(snap.kind, snap.detail, String(snap.dimension ?? "segment"));
        if (spec && !segmentComparisons.has(f.id)) segmentComparisons.set(f.id, spec);
      }
    }
    return {
      id: f.id, headline: f.headline, commentary: f.commentary,
      evidence: rows.map((e) => {
        const v = evidenceView(e.position, e.evidence_snapshot as never);
        return { ref: v.ref, class: v.evidenceClass, label: v.label, question: v.question, canonicalQuestionKey: v.canonicalQuestionKey, dimension: v.dimension, optionLabel: v.optionLabel, count: v.count, base: v.base, percentage: v.percentage };
      }),
    };
  });

  // Pinned Analysis run — Study Story + themes (context) + combined distributions (chart proof).
  const analysis = await getLatestStudyAnalysis(session, studyId);
  const snap = (analysis.run?.evidence_snapshot ?? {}) as { evidence?: { canonicalQuestionKey: string; question: string; scope: string; optionId: string; optionLabel: string; count: number; base: number; percentage: number | null }[]; segmentDerived?: { detail?: Record<string, unknown> }[] };
  const distributions: ReportGovernance["distributions"] = new Map();
  for (const e of snap.evidence ?? []) {
    if (e.scope !== "combined") continue;
    const d = distributions.get(e.canonicalQuestionKey) ?? { question: e.question, options: [] };
    d.options.push({ optionId: e.optionId, label: e.optionLabel, count: e.count, base: e.base, percentage: e.percentage });
    distributions.set(e.canonicalQuestionKey, d);
  }
  // Markets — distinct group names from the pinned run's segment facts (no invention).
  const markets = new Set<string>();
  for (const s of snap.segmentDerived ?? []) {
    const det = s.detail ?? {};
    for (const g of (det.groups as { group?: string }[] | undefined) ?? []) if (g.group) markets.add(g.group);
    if (typeof det.group === "string") markets.add(det.group);
    if (typeof det.highest === "string") markets.add(det.highest); if (typeof det.lowest === "string") markets.add(det.lowest);
  }

  const input: ReportComposerInput = {
    study: { title: results.study.name, objective: results.study.objective ?? "" },
    findings: inputFindings,
    context: {
      story: analysis.narrative ? { headline: analysis.narrative.headline, summary: analysis.narrative.summary } : null,
      themes: (analysis.themes ?? []).map((t) => ({ title: t.title, interpretation: t.interpretation })),
    },
    methodology: {
      surveys: results.surveys.map((s) => ({ name: s.surveyName, responses: s.completedResponses })),
      totalResponses: results.study.completedResponses,
      markets: [...markets].sort(),
    },
    editorialBrief: editorialBrief?.trim() || null,
  };
  const governance: ReportGovernance = { findingIds: new Set(ids), governedNumbers: governedNumbersOf(inputFindings), distributions, segmentComparisons };
  return { access: "ok", input, governance, pinnedRunId: analysis.run?.id ?? null, sourceFindingIds: ids };
}

/** Deterministic readiness (drives whether "Generate" is enabled). */
export async function reportReadinessFor(session: AuthedUser, studyId: string, selected?: string[]): Promise<{ access: string; readiness?: Readiness }> {
  const r = await resolveReportInput(session, studyId, selected);
  if (r.access !== "ok" || !r.input) return { access: r.access };
  return { access: "ok", readiness: reportReadiness({ objective: r.input.study.objective, findings: r.input.findings }) };
}

const bounded = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

/** Compose + verify → an editorial StudyReportDocument, WITHOUT persisting (used by the
 *  read-only preview harness and the production generate path). */
export async function composeReportDocument(
  input: ReportComposerInput, governance: ReportGovernance, opts?: { complete?: CompleteFn },
): Promise<{ ok: boolean; document?: StudyReportDocument; composed?: ComposedReport; error?: string; reasons?: string[] }> {
  const complete = opts?.complete ?? completeJSON;
  const ready = reportReadiness({ objective: input.study.objective, findings: input.findings });
  if (!ready.ok) return { ok: false, error: ready.reason };
  let composed: ComposedReport;
  try { composed = await complete<ComposedReport>({ prompt: buildReportComposerPrompt(input), model: "gpt-4o", temperature: 0.25, maxTokens: 3000 }); }
  catch (e) { return { ok: false, error: `The report composer was unavailable (${bounded(e)}).` }; }
  let verdict = verifyComposedReport(composed, input, governance);
  // Up to TWO constrained repairs — same inputs, each told exactly what failed. This does NOT
  // weaken governance: every attempt is fully re-verified and nothing ungoverned is ever emitted;
  // the extra attempt only gives the editor another chance to comply with the language rules
  // (LLM word-choice slips such as "significantly" are the common cause of an otherwise-sound draft
  // being rejected). If it still fails, the report is refused, not published.
  for (let attempt = 0; attempt < 2 && !verdict.ok; attempt++) {
    try {
      const repaired = await complete<ComposedReport>({ prompt: `${buildReportComposerPrompt(input)}\n\nA previous draft was REJECTED for: ${verdict.reasons.join("; ")}. Fix ONLY those problems and change nothing else; keep everything grounded in the approved findings and within the content budgets. If a banned word was flagged, replace it with static descriptive language and re-read your JSON to be sure none remain.`, model: "gpt-4o", temperature: 0.2, maxTokens: 3000 });
      const v2 = verifyComposedReport(repaired, input, governance);
      if (v2.ok) { composed = repaired; verdict = v2; break; }
      verdict = v2; // carry the latest reasons into the next repair prompt
    } catch { /* fall through to failure */ }
  }
  if (!verdict.ok) return { ok: false, error: "The generated report did not pass governance checks.", reasons: verdict.reasons };
  return { ok: true, document: buildStudyReportDocument(composed, input, governance), composed };
}

/**
 * Slice A — compose ONE governed Executive editorial page WITHOUT persisting. Reuses the exact
 * verified composition path (`composeReportDocument` → verified `composed`) so all existing
 * governance applies unchanged, then builds the Executive page from the composition + the
 * Governed Visual Evidence Contract. Preview-only; nothing is written.
 */
export async function composeExecutivePage(
  input: ReportComposerInput, governance: ReportGovernance, opts?: { complete?: CompleteFn },
): Promise<{ ok: boolean; document?: ExecutiveReportDocument; error?: string; reasons?: string[] }> {
  const plan = await composeExecutivePlan(input, governance, opts);
  if (!plan.ok || !plan.plan) return { ok: false, error: plan.error, reasons: plan.reasons };
  const page = buildExecutivePage(plan.plan, input, governance);
  if (!page.ok || !page.document) return { ok: false, error: "The study does not have enough governed material for a report page.", reasons: page.reasons };
  return { ok: true, document: page.document };
}

/**
 * Slice B — compose the full ADAPTIVE infographic report (Page 1 Executive + Page 2 Evidence)
 * WITHOUT persisting. Page 2 is produced only if there is distinct governed material beyond the
 * Page-1 topline; `reportStoryComplete` says whether any further distinct story remains. Reuses
 * the exact governed composers; the server owns every value; nothing is written.
 */
export type InfographicReport = {
  ok: boolean; error?: string; reasons?: string[];
  pages?: { executive: ExecutiveReportDocument; evidence: EvidenceReportDocument | null };
  richness?: { level: string; recommendedPageBudget: number };
  reportStoryComplete?: boolean;
  unusedGovernedDistributions?: { question: string; reason: string }[];
};
export async function composeInfographicReport(
  input: ReportComposerInput, governance: ReportGovernance, opts?: { complete?: CompleteFn },
): Promise<InfographicReport> {
  const richness = assessRichness(input, governance);
  const exec = await composeExecutivePage(input, governance, opts);
  if (!exec.ok || !exec.document) return { ok: false, error: exec.error, reasons: exec.reasons };

  // Page 1 shows the primary distribution — exclude that question from Page 2 (no repetition).
  const ve = resolveVisualEvidence(input, governance);
  const p1q = primaryDistribution(ve)?.questionKey;
  const exclude = new Set<string>(p1q ? [p1q] : []);

  // Governed distributions that no approved Finding permits (excluded by the Finding-vs-Result boundary).
  const showable = new Set<string>();
  for (const f of input.findings) for (const e of f.evidence) if (e.canonicalQuestionKey && governance.distributions.has(e.canonicalQuestionKey)) showable.add(e.canonicalQuestionKey);
  const unusedGovernedDistributions = [...governance.distributions.entries()]
    .filter(([k]) => !showable.has(k))
    .map(([, d]) => ({ question: d.question, reason: "no approved Finding permits this result — excluded by the Finding-vs-Result boundary" }));

  const richnessOut = { level: richness.level, recommendedPageBudget: richness.recommendedPageBudget };

  // Page-worthiness: only build Page 2 if distinct governed material remains beyond Page 1.
  const avail = availableEvidence(input, governance, exclude);
  if (!avail.segments.length && !avail.distributions.length) {
    return { ok: true, pages: { executive: exec.document, evidence: null }, richness: richnessOut, reportStoryComplete: true, unusedGovernedDistributions };
  }

  const ctx = { page1Headline: exec.document.headline, shownStories: describeStories(avail) };
  const plan = await composeEvidencePlan(input, governance, ctx, opts);
  if (!plan.ok || !plan.plan) {
    // Page-2 words could not be composed under governance — ship the one-page report; story not complete.
    return { ok: true, pages: { executive: exec.document, evidence: null }, richness: richnessOut, reportStoryComplete: false, unusedGovernedDistributions };
  }
  const page2 = buildEvidencePage(plan.plan, input, governance, { excludeQuestionKeys: exclude });
  if (!page2.ok || !page2.document) return { ok: true, pages: { executive: exec.document, evidence: null }, richness: richnessOut, reportStoryComplete: false, unusedGovernedDistributions };

  // Complete when Page 2 placed everything (no overflow) — no further distinct story remains.
  return { ok: true, pages: { executive: exec.document, evidence: page2.document }, richness: richnessOut, reportStoryComplete: (page2.overflow ?? 0) === 0, unusedGovernedDistributions };
}

/** Generate + PERSIST a draft report (production path). */
export async function generateReport(
  session: AuthedUser, studyId: string, body: { title?: string; selectedFindingIds?: string[]; editorialBrief?: string | null }, opts?: { complete?: CompleteFn },
): Promise<Result<{ report: ReportRow }>> {
  const r = await resolveReportInput(session, studyId, body.selectedFindingIds, body.editorialBrief);
  if (r.access === "forbidden") return { ok: false, status: 403, error: "Forbidden" };
  if (r.access !== "ok" || !r.input || !r.governance) return { ok: false, status: 404, error: "Study not found" };
  if (body.title?.trim()) r.input.study.title = body.title.trim();

  const composed = await composeReportDocument(r.input, r.governance, opts);
  if (!composed.ok || !composed.document) { if (composed.reasons?.length) console.warn(`[reports] ${studyId} verification failed`, composed.reasons); return { ok: false, status: 422, error: composed.error ?? "Could not generate the report." }; }

  const { data: row, error } = await supabaseAdmin.from("study_reports").insert({
    study_id: studyId, title: composed.document.title, report_type: "report", status: "draft",
    editorial_brief: r.input.editorialBrief, config: composed.document, source_finding_ids: r.sourceFindingIds ?? [],
    analysis_run_id: r.pinnedRunId ?? null, source_snapshot: { findings: r.input.findings, composerVersion: REPORT_COMPOSER_VERSION },
    created_by: session.workEmail ?? null,
  }).select("*").single();
  if (error || !row) return { ok: false, status: 500, error: error?.message ?? "Could not save the report." };
  return { ok: true, status: 201, data: { report: row as ReportRow } };
}

export async function listReports(session: AuthedUser, studyId: string): Promise<Result<{ reports: { id: string; title: string; status: string; report_type: string; created_at: string; stale: boolean }[] }>> {
  const access = await authorise(session, studyId);
  if (access === "forbidden") return { ok: false, status: 403, error: "Forbidden" };
  if (access !== "ok") return { ok: false, status: 404, error: "Study not found" };
  const { data } = await supabaseAdmin.from("study_reports").select("id, title, status, report_type, source_finding_ids, created_at").eq("study_id", studyId).order("created_at", { ascending: false });
  // Staleness: the set of current findings differs from what the report was built from.
  const { data: curFindings } = await supabaseAdmin.from("study_findings").select("id").eq("study_id", studyId);
  const curSet = new Set((curFindings ?? []).map((f) => (f as { id: string }).id));
  const reports = ((data ?? []) as { id: string; title: string; status: string; report_type: string; source_finding_ids: string[]; created_at: string }[]).map((r) => {
    const src = r.source_finding_ids ?? [];
    const stale = src.some((id) => !curSet.has(id)) || src.length !== [...curSet].filter((id) => src.includes(id)).length;
    return { id: r.id, title: r.title, status: r.status, report_type: r.report_type, created_at: r.created_at, stale };
  });
  return { ok: true, status: 200, data: { reports } };
}

export async function getReport(session: AuthedUser, studyId: string, reportId: string): Promise<Result<{ report: ReportRow; stale: boolean }>> {
  const access = await authorise(session, studyId);
  if (access === "forbidden") return { ok: false, status: 403, error: "Forbidden" };
  if (access !== "ok") return { ok: false, status: 404, error: "Study not found" };
  const { data } = await supabaseAdmin.from("study_reports").select("*").eq("id", reportId).single();
  const row = data as ReportRow | null;
  if (!row || row.study_id !== studyId) return { ok: false, status: 404, error: "Report not found" };
  const { data: curFindings } = await supabaseAdmin.from("study_findings").select("id").eq("study_id", studyId);
  const curSet = new Set((curFindings ?? []).map((f) => (f as { id: string }).id));
  const src = row.source_finding_ids ?? [];
  const stale = src.some((id) => !curSet.has(id));
  return { ok: true, status: 200, data: { report: row, stale } };
}
