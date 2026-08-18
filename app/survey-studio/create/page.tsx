// Survey Studio → Create landing. This route is a DESTINATION, not an action:
// it never creates a survey on load. CreateLanding offers an explicit "New
// survey" (the only trigger for the existing governed POST /api/surveys) and a
// "Resume draft" shortcut into the user's most recent in-progress draft.
// Existing surveys open directly at /survey-studio/create/[surveyId].
import { CreateLanding } from "@/app/components/studio/create/CreateLanding";

export default function SurveyStudioCreatePage() {
  return <CreateLanding />;
}
