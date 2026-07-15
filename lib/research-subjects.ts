// Research Subject — what a Research Project is about (brand/club/league/
// tournament/publisher/federation/custom), orthogonal to Study Type (the
// research methodology, shared with Campaigns/Campaign Groups/Surveys via
// lib/naming.ts). Shared between the Research Projects list page and the
// Workspace so the label set never drifts between the two.
export const RESEARCH_SUBJECTS = ["brand", "club", "league", "tournament", "publisher", "federation", "custom"] as const;
export type ResearchSubject = (typeof RESEARCH_SUBJECTS)[number];

export const RESEARCH_SUBJECT_LABELS: Record<ResearchSubject, string> = {
  brand: "Brand", club: "Club", league: "League", tournament: "Tournament",
  publisher: "Publisher", federation: "Federation", custom: "Custom",
};

export function researchSubjectLabel(value: string | null): string {
  if (!value) return "—";
  return RESEARCH_SUBJECT_LABELS[value as ResearchSubject] ?? value;
}
