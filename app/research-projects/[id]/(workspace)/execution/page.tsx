"use client";

// The Execution area — the operational workspace where research is configured,
// deployed and run: the per-source cards with campaigns, creative, deployment
// and Run Research, plus the read-only Campaign Groups view. The (workspace)
// shell layout provides AdminShell, the ProjectProvider data layer and the
// project header + navigation, so this page renders the body chromeless. See
// ExecutionBody.
import { ExecutionBody } from "@/app/components/research-projects/ExecutionBody";

export default function ResearchProjectExecutionPage() {
  return <ExecutionBody />;
}
