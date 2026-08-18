// Legacy deep-link → canonical create-study destination (preserving ?studyId edit).
import { redirect } from "next/navigation";

export default async function LegacyCreateStudyRedirect({ searchParams }: { searchParams: Promise<{ studyId?: string | string[] }> }) {
  const sp = await searchParams;
  const studyId = Array.isArray(sp.studyId) ? sp.studyId[0] : sp.studyId;
  redirect(`/survey-studio/discover/studies/create${studyId ? `?studyId=${encodeURIComponent(studyId)}` : ""}`);
}
