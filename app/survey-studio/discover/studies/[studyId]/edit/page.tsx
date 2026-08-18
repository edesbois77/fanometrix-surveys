// Survey Studio → Discover → Dashboards → Edit a user Study.
// Reuses the exact Study Builder (CreateStudyWorkflow) in edit mode — no duplicated
// business logic. The studyId comes from the path so the breadcrumb reads
// Home › Discover › Dashboards › [Study name] › Edit study. All authorisation is
// enforced by the governed studies endpoints (server revalidation); this page adds
// no access model of its own.
import { CreateStudyWorkflow } from "@/app/components/studio/discover/CreateStudyWorkflow";

export default async function EditStudyPage({ params }: { params: Promise<{ studyId: string }> }) {
  const { studyId } = await params;
  return <CreateStudyWorkflow studyId={studyId} />;
}
