// Legacy deep-link → canonical edit-study destination.
import { redirect } from "next/navigation";

export default async function LegacyEditStudyRedirect({ params }: { params: Promise<{ studyId: string }> }) {
  const { studyId } = await params;
  redirect(`/survey-studio/discover/studies/${encodeURIComponent(studyId)}/edit`);
}
