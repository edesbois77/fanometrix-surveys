// Discover → Dashboards → Study → [studyId]. Study-level dashboard for a research
// exercise (multiple related surveys). Authorisation is enforced server-side by the
// Study API (intersect-only over already-authorised surveys).
import { StudyDashboard } from "@/app/components/studio/discover/StudyDashboard";

export default async function StudyDashboardPage({ params }: { params: Promise<{ studyId: string }> }) {
  const { studyId } = await params;
  return <StudyDashboard studyId={studyId} />;
}
