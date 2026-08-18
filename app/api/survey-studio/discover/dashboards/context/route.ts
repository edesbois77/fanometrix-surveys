// ── Survey Studio → Discover → Dashboards — landing context (read-only) ──────
// Governed bootstrap for the Dashboards landing. Surfaces STUDIES first (a study
// is a complete research exercise) and standalone surveys separately, with cheap
// top-line context (survey/publisher/market counts + full completions) — NO heavy
// analytics, NO raw rows. study_id is an intersect-only grouping label over the
// already-authorised surveys; it never grants access.
//
// AUTHORISATION: requireUser → resolveDashboardScope (dataVisibleCampaignIds) →
// project studies/surveys + manifest from the authorised campaign universe only.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { resolveDashboardScope, resolveEntitledSurveys } from "@/lib/studio/dashboard-scope";
import { resolveDashboardManifest, type DashboardManifest } from "@/lib/studio/dashboard-manifest";
import { assembleLanding, assembleUserStudies, type LandingStudy, type LandingSurvey } from "@/lib/studio/dashboard-landing";
import { eventCountsFor, perQuestionAnswerCounts } from "@/lib/studio/dashboard-metrics";
import { canCreateStudy } from "@/lib/studio/user-study";

export type { LandingStudy, LandingSurvey };

export type DashboardContext = {
  context: { organisationName: string | null; organisationType: string | null; unrestricted: boolean };
  studies: LandingStudy[];
  /** ALL individually-authorised surveys, including those that also belong to a Study. */
  surveys: LandingSurvey[];
  filterManifest: DashboardManifest;
  scope: { studyCount: number; surveyCount: number };
  /** Whether the caller may create a user Study (has an org + ≥2 eligible surveys). */
  canCreateStudy: boolean;
};

export async function GET(req: NextRequest) {
  let session;
  try { session = await requireUser(req, ["admin", "brand", "agency", "publisher"]); }
  catch (err) { return err as Response; }

  const scope = await resolveDashboardScope(session);
  const contextMeta = { organisationName: session.organisationName, organisationType: session.organisationType, unrestricted: scope.unrestricted };
  const empty: DashboardContext = { context: contextMeta, studies: [], surveys: [], filterManifest: { dimensions: [] }, scope: { studyCount: 0, surveyCount: 0 }, canCreateStudy: false };
  if (scope.isEmpty) return NextResponse.json(empty);

  const [surveys, filterManifest, statsRes] = await Promise.all([
    resolveEntitledSurveys(scope),
    resolveDashboardManifest(scope.effectiveCampaigns),
    supabaseAdmin.from("vw_campaign_stats").select("campaign_id, response_count").in("campaign_id", scope.authorisedCampaignSlugs),
  ]);
  if (surveys.length === 0) return NextResponse.json({ ...empty, filterManifest });

  const respBySlug = new Map((statsRes.data ?? []).map((r) => [r.campaign_id as string, Number(r.response_count) || 0]));

  // Per-survey "questions answered" — the SAME governed, partial-aware primitive the
  // Study Dashboard uses (eventCountsFor → perQuestionAnswerCounts), so the Survey
  // cards reconcile exactly to the Study totals. NOT completions, NOT questions×n.
  const campsOf = (surveyId: string) => scope.campaigns.filter((c) => c.survey_id === surveyId).map((c) => c.campaign_id).filter(Boolean);
  const answerPairs = await Promise.all(surveys.map(async (s) => {
    const slugs = campsOf(s.id);
    if (!slugs.length) return [s.id, 0] as const;
    const counts = await eventCountsFor(slugs);
    const ans = await perQuestionAnswerCounts(slugs, s.questionCount, counts);
    return [s.id, ans.counts.reduce((a, b) => a + b, 0)] as const;
  }));
  const answersBySurvey = new Map<string, number>(answerPairs);

  // Discover STUDIES are the caller's ORGANISATION-created groupings ONLY. Canonical
  // Research Exercises (surveys.study_id) are deliberately NOT surfaced here — they
  // remain an internal/platform concept (Manage, Reports, Analysis) and their study
  // dashboard URLs still resolve; they simply aren't advertised as Discover Studies.
  const { data: userStudyRows } = session.organisationId
    ? await supabaseAdmin.from("dashboard_studies").select("id, name, dashboard_study_surveys(survey_id)").eq("organisation_id", session.organisationId)
    : { data: [] as { id: string; name: string | null; dashboard_study_surveys: { survey_id: string }[] }[] };

  // Surveys list is unchanged: EVERY authorised survey (incl. canonical-study members).
  const { surveys: landingSurveys } = assembleLanding(surveys, scope.campaigns, respBySlug, new Map(), answersBySurvey);
  const studies = assembleUserStudies(
    ((userStudyRows ?? []) as { id: string; name: string | null; dashboard_study_surveys?: { survey_id: string }[] }[])
      .map((r) => ({ id: r.id, name: r.name ?? null, memberSurveyIds: (r.dashboard_study_surveys ?? []).map((m) => m.survey_id) })),
    surveys, scope.campaigns, respBySlug, answersBySurvey,
  );

  return NextResponse.json({
    context: contextMeta, studies, surveys: landingSurveys, filterManifest,
    scope: { studyCount: studies.length, surveyCount: landingSurveys.length },
    canCreateStudy: !!session.organisationId && canCreateStudy(surveys.length),
  } satisfies DashboardContext);
}
