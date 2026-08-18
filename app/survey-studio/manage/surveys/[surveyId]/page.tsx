import { ManageSurveyDetail } from "@/app/components/studio/manage/ManageSurveyDetail";

// Manage → Survey → management control centre. Lifecycle-aware Edit / Archive /
// Restore / Delete over the effective survey state, the truthful campaign universe
// (Studio + legacy) and the research-definition lock. Access is enforced by
// /api/studio/surveys/[id]/manage (owner-scoped: surveys.organisation_id, admin
// bypass) — this page adds no second access model. Results/Findings remain
// available as secondary operational views.
export default async function ManageSurveyPage({ params }: { params: Promise<{ surveyId: string }> }) {
  const { surveyId } = await params;
  return <ManageSurveyDetail surveyId={surveyId} />;
}
