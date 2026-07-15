// Shared lookup tables used by more than one Workspace section — moved
// out of WorkspaceBody.tsx so the extracted section components (Intelligence,
// Reports, Conclusion) don't need to import from the orchestrator itself.
import type { BadgeTone } from "@/app/components/research-projects/ActionPrimitives";

export const INTELLIGENCE_STATUS_META: Record<string, { label: string; className: string }> = {
  not_started: { label: "Not started", className: "bg-gray-100 text-gray-500" },
  draft:       { label: "Draft",        className: "bg-amber-50 text-amber-700" },
  edited:      { label: "Edited",       className: "bg-amber-50 text-amber-700" },
  approved:    { label: "Approved",     className: "bg-green-50 text-green-700" },
  published:   { label: "Published",    className: "bg-green-100 text-green-800" },
};

// Tone equivalent of the map above, for callers rendering through the
// shared <StatusBadge> primitive instead of INTELLIGENCE_STATUS_META's
// own className directly.
export const INTELLIGENCE_STATUS_TONE: Record<string, BadgeTone> = {
  not_started: "neutral",
  draft:       "warning",
  edited:      "warning",
  approved:    "success",
  published:   "success",
};

export const TARGET_REACHED_LABEL: Record<string, string> = {
  none: "Continue collecting responses",
  pause: "Pause all campaigns",
  close: "Close all campaigns",
};

// Every Research Source type's badge — reused by both the Research Sources
// card and the Intelligence rows, so a source always reads as "the same
// thing" wherever it appears in the Workspace.
export const SOURCE_BADGE: Record<string, string> = {
  survey: "Survey",
  social_search: "Conversation Search",
  document: "Document",
};
