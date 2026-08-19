// ── Survey Studio → Dashboards → Findings API (read-only) ───────────────────
// "What does this research tell me?" — a small ranked set of deterministic,
// evidence-backed findings for ONE authorised survey, governed by the SAME
// data-entitlement scope and filters as Performance/Results. NO AI, NO
// persistence, NO respondent-level cross-tabs. Every number re-derives from the
// governed per-question distributions; findings are computed at read time.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { resolveDashboardScope } from "@/lib/studio/dashboard-scope";
import { resolveDashboardManifest, validateDashboardFilters, effectiveSlugsForFilters } from "@/lib/studio/dashboard-manifest";
import { normaliseQuestions } from "@/lib/studio/survey-results-resolve";
import { resolveDiscoverResults, type ResultsMode } from "@/lib/studio/dashboard-results";
import { resolveSurveySegmentEvidence } from "@/lib/studio/survey-segments-resolve";
import { computeStatusWithReason, type CampaignForStatus } from "@/lib/campaign-status";
import { canManageSurvey } from "@/lib/studio/collection-health";
import { surveyAnalysisEligibility } from "@/lib/studio/survey-analysis-evidence";
import {
  buildSurveyFindings, findingsContext,
  type SurveyFinding, type SurveyFindingsContext, type SurveyQuestionEvidence,
} from "@/lib/studio/survey-findings-engine";
import { getCurrentSurveyAnalysis, type SurveyAnalysisView } from "@/lib/studio/survey-analysis-service";
import { getSurveyCoreIntelligence, coreReadVisibleFor } from "@/lib/studio/core-intelligence";
import type { CoreFindingsProjection } from "@/lib/core/studio/projection";

export type FindingsResponse =
  | { authorised: false }
  | {
      authorised: true;
      filterRejected: boolean;
      survey: { id: string; name: string; questionCount: number };
      context: SurveyFindingsContext;
      /** `answers` = total question-answers (Σ per-question base); `respondents` =
       *  people who answered (max per-question base). They are NOT the same number —
       *  a respondent answers multiple questions. */
      counts: { answers: number; respondents: number; questions: number };
      mode: ResultsMode;
      findings: SurveyFinding[];
      /** Current (latest completed) AI research synthesis, or null. READ ONLY — the
       *  model is NEVER invoked from Discover; this is a cache read. */
      analysis: SurveyAnalysisView | null;
      /** Stage 6 (controlled read): Core-derived product findings for this survey, or
       *  null. Present only when ANALYTICAL_CORE_PRODUCT_READ_ENABLED is on AND the
       *  caller is entitled to the AI analysis scope. ADDITIVE + subordinate — never
       *  replaces `analysis`/`findings`; the product falls back to those if null. */
      coreIntelligence: CoreFindingsProjection | null;
      /** Whether this survey has enough evidence to be analysed (authoritative rule). */
      analysisEligible: boolean;
      /** Whether the CURRENT caller may generate analysis (canManageSurvey — owner/admin)
       *  AND it is eligible AND no completed analysis exists yet. Drives the restrained
       *  "Analyse survey" opportunity in Discover. Read-only signal — generation still
       *  goes through the governed POST endpoint, which re-authorises server-side. */
      canGenerate: boolean;
    };

export async function GET(req: NextRequest, { params }: { params: Promise<{ surveyId: string }> }) {
  const { surveyId } = await params;
  let session;
  try { session = await requireUser(req, ["admin", "brand", "agency", "publisher"]); }
  catch (err) { return err as Response; }

  const scope = await resolveDashboardScope(session, { requestedSurveyId: surveyId });
  if (scope.isEmpty || scope.requestedSurveyId !== surveyId) {
    return NextResponse.json({ authorised: false } satisfies FindingsResponse);
  }

  const { data: surveyRow } = await supabaseAdmin
    .from("surveys").select("id, name, questions, enabled_languages, organisation_id").eq("id", surveyId).is("deleted_at", null).single();
  const questions = normaliseQuestions((surveyRow as { questions?: unknown })?.questions);
  const survey = {
    id: surveyId,
    name: (surveyRow?.name as string) || "Untitled survey",
    enabledLanguages: Array.isArray(surveyRow?.enabled_languages) ? (surveyRow!.enabled_languages as string[]) : [],
    questions,
  };

  const filterManifest = await resolveDashboardManifest(scope.effectiveCampaigns);
  const p = req.nextUrl.searchParams;
  const validation = validateDashboardFilters(filterManifest, {
    publisher: p.get("publisher"), market: p.get("market"), language: p.get("language"), campaign: p.get("campaign"),
  });
  const filterRejected = !validation.ok;
  const appliedFilters = validation.ok ? validation.filters : {};
  const filteredSlugs = filterRejected ? [] : effectiveSlugsForFilters(scope.effectiveCampaigns, appliedFilters);

  // Overall governed per-question distributions (same source as Results).
  const results = await resolveDiscoverResults(
    { questions: survey.questions, enabledLanguages: survey.enabledLanguages },
    filteredSlugs,
    p.get("lang"),
  );
  const segments = await resolveSurveySegmentEvidence(
    { questions: survey.questions }, filteredSlugs, results.mode, results.displayLanguage,
  );

  // Emerging vs Final — filter-INDEPENDENT: is the survey still collecting? Derived
  // from the caller's ENTITLED campaigns for this survey (never beyond entitlement).
  const hasLiveCampaign = await resolveHasLiveCampaign(scope.effectiveCampaigns.map((c) => c.id));

  const questionEvidence: SurveyQuestionEvidence[] = results.questions.map((q) => ({
    index: q.questionIndex,
    questionId: q.questionId,
    text: q.text,
    base: q.base,
    shown: q.shown,
    options: q.options,
  }));
  const totalAnswered = questionEvidence.reduce((a, q) => a + q.base, 0);
  // Respondents ≈ the most-answered question's base (everyone who answered at least
  // the first question). Distinct from `totalAnswered` (answers across all questions).
  const respondents = questionEvidence.reduce((m, q) => Math.max(m, q.base), 0);

  const findings = buildSurveyFindings({
    surveyName: survey.name,
    mode: results.mode,
    questions: questionEvidence,
    segments,
  });
  const context = findingsContext({ hasLiveCampaign, totalAnswered });

  // Current AI synthesis (cache read — the model is NEVER invoked here). It is
  // filter-INDEPENDENT (whole-survey scope at generation time, not recomputed on
  // filter change) AND entitlement-gated: it is returned ONLY when the caller is
  // entitled to the WHOLE governed campaign scope it was generated from, using the
  // SAME Dashboard/Data universe already resolved above. A subset/overlap caller
  // gets null here and falls back to the deterministic findings (their own scope).
  const analysis = await getCurrentSurveyAnalysis(surveyId, {
    unrestricted: scope.unrestricted,
    authorisedCampaignIds: scope.authorisedCampaignIds,
  });

  // Stage 6/8 controlled read — Core-derived findings, ADDITIVE. Exposure = internal
  // admins always, everyone else the global flag (coreReadVisibleFor). Reuses the SAME
  // entitlement decision as the AI analysis (only when `analysis` is visible → the
  // caller is entitled to the whole scope AND a completed run exists). Deterministic +
  // failure-isolated: null ⇒ the product simply omits it.
  const coreIntelligence = analysis != null
    ? await getSurveyCoreIntelligence(surveyId, coreReadVisibleFor(session))
    : null;

  // Analyse-in-Discover opportunity — authoritative eligibility + the EXISTING
  // Manage authority (canManageSurvey). Read-only: no model is invoked here.
  const maxBase = results.questions.reduce((m, q) => Math.max(m, q.base), 0);
  const analysisEligible = surveyAnalysisEligibility(maxBase).eligible;
  const canGenerate = analysisEligible && analysis == null && canManageSurvey(session, { organisation_id: (surveyRow?.organisation_id as string | null) ?? null });

  return NextResponse.json({
    authorised: true,
    filterRejected,
    survey: { id: survey.id, name: survey.name, questionCount: survey.questions.length },
    context,
    counts: { answers: totalAnswered, respondents, questions: survey.questions.length },
    mode: results.mode,
    findings,
    analysis,
    coreIntelligence,
    analysisEligible,
    canGenerate,
  } satisfies FindingsResponse);
}

/** True when any of the given (entitled) campaigns is EFFECTIVELY live. Read-only. */
async function resolveHasLiveCampaign(effectiveIds: string[]): Promise<boolean> {
  if (effectiveIds.length === 0) return false;
  const { data: campRows } = await supabaseAdmin
    .from("campaigns")
    .select("id, campaign_id, status, manual_status_override, start_date, end_date, target_responses, target_mode, archive_after_days, status_updated_at, country_code")
    .in("id", effectiveIds).is("deleted_at", null);
  const rows = campRows ?? [];
  const slugs = rows.map((c) => c.campaign_id as string).filter(Boolean);
  const respBySlug = new Map<string, number>();
  if (slugs.length) {
    const { data: stats } = await supabaseAdmin.from("vw_campaign_stats").select("campaign_id, response_count").in("campaign_id", slugs);
    for (const s of stats ?? []) respBySlug.set(s.campaign_id as string, Number(s.response_count ?? 0) || 0);
  }
  const now = new Date();
  return rows.some((c) => computeStatusWithReason(c as unknown as CampaignForStatus, respBySlug.get(c.campaign_id as string) ?? 0, now).effective === "live");
}
