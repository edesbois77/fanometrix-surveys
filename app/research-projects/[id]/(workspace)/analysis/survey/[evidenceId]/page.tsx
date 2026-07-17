"use client";

// Analysis › Survey Findings reader, mounted inside the Research Project
// workspace shell. Reuses the shared SurveyFindingsReader; review logic, engine,
// approval workflow and stored output are untouched.
import { SurveyFindingsReader } from "@/app/components/research-projects/analysis/SurveyFindingsReader";

export default function AnalysisSurveyFindingsPage() {
  return <SurveyFindingsReader />;
}
