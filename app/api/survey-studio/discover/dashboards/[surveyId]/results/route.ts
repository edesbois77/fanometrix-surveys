// ── Survey Studio → Dashboards → Results API (read-only) ─────────────────────
// Phase 4. Actual per-question results for ONE authorised survey, governed by the
// SAME data-entitlement scope as Performance (authorised universe → validate
// filters → narrow → compute). Returns per-question distributions/counts/bases —
// NEVER raw respondent rows. Partial answers included; completion not required.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { resolveDashboardScope } from "@/lib/studio/dashboard-scope";
import { resolveDashboardManifest, validateDashboardFilters, effectiveSlugsForFilters } from "@/lib/studio/dashboard-manifest";
import { normaliseQuestions } from "@/lib/studio/survey-results-resolve";
import { resolveDiscoverResults, type DiscoverResults } from "@/lib/studio/dashboard-results";
import type { DashboardManifest, ValidatedFilters } from "@/lib/studio/dashboard-manifest";

export type ResultsResponse =
  | { authorised: false }
  | {
      authorised: true;
      filterRejected: boolean;
      survey: { id: string; name: string; status: string | null; questionCount: number };
      results: DiscoverResults;
      filterManifest: DashboardManifest;
      appliedFilters: ValidatedFilters;
    };

export async function GET(req: NextRequest, { params }: { params: Promise<{ surveyId: string }> }) {
  const { surveyId } = await params;
  let session;
  try { session = await requireUser(req, ["admin", "brand", "agency", "publisher"]); }
  catch (err) { return err as Response; }

  const scope = await resolveDashboardScope(session, { requestedSurveyId: surveyId });
  if (scope.isEmpty || scope.requestedSurveyId !== surveyId) {
    return NextResponse.json({ authorised: false } satisfies ResultsResponse);
  }

  const { data: surveyRow } = await supabaseAdmin
    .from("surveys").select("id, name, status, questions, enabled_languages").eq("id", surveyId).is("deleted_at", null).single();
  const questions = normaliseQuestions((surveyRow as { questions?: unknown })?.questions);
  const survey = {
    id: surveyId,
    name: (surveyRow?.name as string) || "Untitled survey",
    status: (surveyRow?.status as string | null) ?? null,
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

  const results = await resolveDiscoverResults(
    { questions: survey.questions, enabledLanguages: survey.enabledLanguages },
    filteredSlugs,
    p.get("lang"),
  );

  return NextResponse.json({
    authorised: true,
    filterRejected,
    survey: { id: survey.id, name: survey.name, status: survey.status, questionCount: survey.questions.length },
    results,
    filterManifest,
    appliedFilters,
  } satisfies ResultsResponse);
}
