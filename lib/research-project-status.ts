// A Research Project's own Status is always derived, never a manual
// dropdown — campaigns own operational status (draft/scheduled/live/
// paused/closed/archived); this reflects the state of the research
// itself. `research_projects.status` (a separate column) keeps its own,
// narrower job — seeding the "Initial Status" new campaigns get from the
// Deployment Wizard's Campaign Defaults step — and is never read here.
export type ProjectStatus = "draft" | "active" | "complete" | "archived";

export function computeProjectStatus(
  project: {
    archived_at: string | null;
    completed_at: string | null;
    target_reached_at: string | null;
  },
  hasActiveCampaign: boolean
): ProjectStatus {
  if (project.archived_at) return "archived";
  if (project.completed_at || project.target_reached_at) return "complete";
  if (hasActiveCampaign) return "active";
  return "draft";
}

export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; dot: string; bg: string; text: string }> = {
  draft:     { label: "Draft",    dot: "🟡", bg: "bg-amber-50",  text: "text-amber-700" },
  active:    { label: "Active",   dot: "🟢", bg: "bg-green-50",  text: "text-green-700" },
  complete:  { label: "Complete", dot: "🔵", bg: "bg-blue-50",   text: "text-blue-700"  },
  archived:  { label: "Archived", dot: "⚪", bg: "bg-gray-50",   text: "text-gray-400"  },
};
