// Discover → Surveys. The straightforward list of surveys the caller is entitled to
// discover (governed context endpoint; entitlement/filtering unchanged). Clicking a
// survey opens /survey-studio/discover/surveys/[id] (Dashboard | Results | Findings |
// Campaigns). Reuses the shared landing in "surveys" mode.
import { DashboardsLanding } from "@/app/components/studio/discover/DashboardsLanding";

export default function DiscoverSurveysPage() {
  return <DashboardsLanding section="surveys" />;
}
