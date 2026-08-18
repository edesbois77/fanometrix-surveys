// Discover → Studies. The straightforward list of studies the caller is entitled to
// discover (governed context endpoint; study membership + entitlement unchanged).
// Clicking a study opens /survey-studio/discover/studies/[id] (Dashboard | Surveys |
// Publishers | Markets | Results). Reuses the shared landing in "studies" mode.
import { DashboardsLanding } from "@/app/components/studio/discover/DashboardsLanding";

export default function DiscoverStudiesPage() {
  return <DashboardsLanding section="studies" />;
}
