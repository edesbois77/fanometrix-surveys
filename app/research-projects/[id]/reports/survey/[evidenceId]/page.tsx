"use client";

// Survey Findings — global/report host. The reader itself now lives in the
// shared, chromeless SurveyFindingsReader so it can also mount inside the
// Research Project workspace shell at (workspace)/analysis/survey/[evidenceId].
// This page keeps the AdminShell chrome, so Product Walkthrough's re-export of
// this page is unchanged.
import { AdminShell } from "@/app/components/AdminShell";
import { SurveyFindingsReader } from "@/app/components/research-projects/analysis/SurveyFindingsReader";

export default function SurveyIntelligencePage() {
  return (
    <AdminShell>
      <SurveyFindingsReader />
    </AdminShell>
  );
}
