"use client";

// The Activity utility page — the project's day-grouped activity log. Activity
// is a persistent project utility reached from the project header, not a
// primary research area, so it is intentionally not part of the six-area
// navigation. The (workspace) shell layout provides AdminShell, the
// ProjectProvider data layer and the project header + navigation, so this page
// renders the body chromeless. See ActivityBody for what it does.
import { ActivityBody } from "@/app/components/research-projects/ActivityBody";

export default function ResearchProjectActivityPage() {
  return <ActivityBody />;
}
