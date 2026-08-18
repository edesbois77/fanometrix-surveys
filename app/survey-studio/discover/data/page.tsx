// "Data" is not a V1 top-level Discover destination — response data is encountered
// within Surveys/Studies (Results, Campaigns, exports). Preserve old links.
import { redirect } from "next/navigation";

export default function LegacyDataRedirect() {
  redirect("/survey-studio/discover");
}
