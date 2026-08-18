// "Research" is no longer a Discover destination — Surveys, Studies and Reports ARE
// the research. Preserve old links by redirecting to the Discover Dashboard.
import { redirect } from "next/navigation";

export default function LegacyResearchRedirect() {
  redirect("/survey-studio/discover");
}
