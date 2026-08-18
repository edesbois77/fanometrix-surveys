// Legacy deep-link → canonical Study destination (/survey-studio/discover/studies/[id]).
import { redirect } from "next/navigation";

export default async function LegacyStudyDashboardRedirect({ params }: { params: Promise<{ studyId: string }> }) {
  const { studyId } = await params;
  redirect(`/survey-studio/discover/studies/${encodeURIComponent(studyId)}`);
}
