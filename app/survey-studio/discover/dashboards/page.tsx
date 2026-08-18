// Legacy "Dashboards" landing → the Discover Dashboard. Surveys and Studies are now
// their own top-level destinations; this preserves old /discover/dashboards links.
import { redirect } from "next/navigation";

export default function LegacyDashboardsLandingRedirect() {
  redirect("/survey-studio/discover");
}
