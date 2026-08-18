import { RequestForm } from "@/app/components/studio/request/RequestForm";

// The Request page IS the commissioned-research intake form. Submitted-request
// history/review lives in Manage → Requests (same research_requests source).
export default function RequestPage() {
  return <RequestForm />;
}
