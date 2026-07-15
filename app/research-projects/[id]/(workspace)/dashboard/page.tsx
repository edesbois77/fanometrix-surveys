"use client";

// The Dashboard area — the full project-level cross-source collection
// dashboard. Overview shows only a lightweight snapshot that links here. The
// (workspace) shell layout provides AdminShell, the ProjectProvider data
// layer and the project header + navigation, so this page renders the body
// chromeless. See DashboardBody for what it does.
import { DashboardBody } from "@/app/components/research-projects/DashboardBody";

export default function ResearchProjectDashboardPage() {
  return <DashboardBody />;
}
