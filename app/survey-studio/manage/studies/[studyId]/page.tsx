import { ManageStudy } from "@/app/components/studio/manage/ManageStudy";

// Manage → Study container. Access enforced by /api/survey-studio/studies/[id]
// (admin/operator only) — this page adds no second access model.
export default async function ManageStudyPage({ params }: { params: Promise<{ studyId: string }> }) {
  const { studyId } = await params;
  return <ManageStudy studyId={studyId} />;
}
