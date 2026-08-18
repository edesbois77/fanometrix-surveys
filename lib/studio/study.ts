// ── Survey Studio — Study domain (pure) ──────────────────────────────────────
// A Study is a lightweight Studio-native research container grouping 1..N Surveys.
// This module owns the PURE rules: curation access, the list-card projection, and
// membership eligibility. It is NOT the legacy research_project and carries NO
// entitlement semantics — Study is an OPERATIONAL Manage object in V1.

export type StudyStatus = "draft" | "active" | "closed";

export const STUDY_STATUS_LABEL: Record<StudyStatus, string> = {
  draft: "Draft",
  active: "Active",
  closed: "Closed",
};

export function isStudyStatus(v: unknown): v is StudyStatus {
  return v === "draft" || v === "active" || v === "closed";
}

// ── Curation access — Fanometrix (admin/operator) only (V1) ──────────────────
// Study creation/management is a Fanometrix operational action. It is NOT inferred
// from any entitlement (data/finding/report), publisher distribution, or brand/agency
// attribution. Fail-closed: non-admins cannot curate Studies in V1. (Organisation-owned
// Study management is a future extension, deliberately not enabled here.)
export function canCurateStudies(principal: { role: string }): boolean {
  return principal.role === "admin";
}

// ── Study name validation ────────────────────────────────────────────────────
export function validateStudyName(name: unknown): string | null {
  if (typeof name !== "string" || !name.trim()) return "A study name is required.";
  return null;
}

// ── Membership eligibility ───────────────────────────────────────────────────
// A Survey may be ADDED to a Study only when the curator operationally manages it AND
// it is currently STANDALONE (study_id null). A Survey already in another Study is
// NEVER silently moved — it is excluded from "Add existing"; moving requires an
// explicit, separately-authorised action.
export function isEligibleToAdd(
  survey: { study_id: string | null; organisation_id: string | null; is_simulated?: boolean | null; status?: string | null },
): boolean {
  if (survey.study_id) return false;                 // already in a Study — no silent move
  if (survey.is_simulated === true) return false;    // exclude simulated
  if (survey.status === "deleted") return false;
  return true;
}

// ── List-card projection ─────────────────────────────────────────────────────
export type StudyRow = {
  id: string; name: string; objective: string | null; status: string;
  commissioning_organisation_id: string | null; research_request_id: string | null;
  created_at: string; created_by: string | null;
};

export type StudyCard = {
  id: string; name: string; objective: string | null; status: string;
  commissioningOrgId: string | null; fromRequest: boolean;
  surveyCount: number; completedResponses: number; createdAt: string;
};

/** Project a study row + its computed totals (batched by the caller) into a card. */
export function studyCard(row: StudyRow, totals: { surveyCount: number; completedResponses: number }): StudyCard {
  return {
    id: row.id,
    name: row.name,
    objective: row.objective,
    status: row.status,
    commissioningOrgId: row.commissioning_organisation_id,
    fromRequest: !!row.research_request_id,
    surveyCount: totals.surveyCount,
    completedResponses: totals.completedResponses,
    createdAt: row.created_at,
  };
}
