// ── Manage → Survey → Results: question-based descriptive results (read-only) ─
// OPERATIONAL OWNERSHIP scoped (surveys.organisation_id, admin bypass) — NOT data
// entitlement. All aggregation is delegated to the single trusted resolver
// (lib/studio/survey-results-resolve) so Results and Findings never diverge.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/auth-server";
import { loadManagedSurvey, resolveSurveyResults } from "@/lib/studio/survey-results-resolve";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let session: AuthedUser;
  try { session = await requireUser(req); } catch { return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }

  const survey = await loadManagedSurvey(session, id);
  if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 }); // existence-preserving

  const { searchParams } = new URL(req.url);
  const filters = {
    publisher: searchParams.get("publisher"),
    market: searchParams.get("market"),
    campaign: searchParams.get("campaign"),
    language: searchParams.get("language"),
  };
  const resolved = await resolveSurveyResults(survey, filters, searchParams.get("lang"));

  return NextResponse.json({
    survey: { id: survey.id, name: survey.name, questionCount: survey.questions.length, displayLanguage: resolved.displayLanguage, languages: survey.enabledLanguages },
    summary: { completedResponses: resolved.completedResponses, totalValidAnswers: resolved.totalValidAnswers },
    resultMode: resolved.resultMode,
    filters: resolved.filterOptions,
    activeFilters: filters,
    questions: resolved.questions,
  });
}
