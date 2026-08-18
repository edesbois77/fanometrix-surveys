// Survey Studio → Discover → Dashboards → Create / Edit user Study.
// A thin server component: it reads an optional ?studyId (edit) from the query and
// hands off to the client workflow. All authorisation is enforced by the governed
// context endpoint (picker) and the studies write endpoints (server revalidation) —
// this page adds no access model of its own.
import { CreateStudyWorkflow } from "@/app/components/studio/discover/CreateStudyWorkflow";

export default async function CreateStudyPage({ searchParams }: { searchParams: Promise<{ studyId?: string | string[] }> }) {
  const sp = await searchParams;
  const studyId = Array.isArray(sp.studyId) ? sp.studyId[0] : sp.studyId;
  return <CreateStudyWorkflow studyId={studyId} />;
}
