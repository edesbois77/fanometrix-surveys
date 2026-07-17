"use client";

// The Execution homepage — the operational twin of the Research homepage. It
// presents the three operation workflows (Surveys · Conversation Searches ·
// Documents) as live operational summary cards that guide the user into each.
// The (workspace) shell layout provides AdminShell, the ProjectProvider data
// layer and the project header + navigation, so this page renders the body
// chromeless. See ExecutionHomeBody.
//
// The old single-page operational surface (ExecutionBody) is retired in a later
// phase; the file is retained meanwhile.
import { ExecutionHomeBody } from "@/app/components/research-projects/ExecutionHomeBody";

export default function ResearchProjectExecutionPage() {
  return <ExecutionHomeBody />;
}
