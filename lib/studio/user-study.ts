// ── User-created Dashboard Study — validation (pure, server-authoritative) ────
// A user Study groups surveys the caller is ALREADY authorised to see. These pure
// validators are the single gate the create/edit routes run BEFORE any write, and
// they FAIL CLOSED: every submitted survey id must lie inside the caller's governed
// authorised universe (never trust ids from the browser), and a valid grouping
// needs at least STUDY_MIN_SURVEYS. This module knows nothing about access — it is
// handed the already-resolved authorised id set and only enforces the shape.

export const STUDY_MIN_SURVEYS = 2;
export const STUDY_NAME_MAX = 120;

export type StudyDraftResult =
  | { ok: true; name: string; surveyIds: string[] }
  | { ok: false; error: string };

function cleanIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()))];
}

/**
 * Validate a Study create/edit draft against the caller's authorised survey ids.
 * `authorisedSurveyIds` MUST be the governed set (resolveEntitledSurveys), never a
 * broad "surveys owned by the org" list. Any submitted id outside it fails the whole
 * request closed — an unauthorised survey is never silently dropped and never saved.
 */
export function validateStudyDraft(rawName: unknown, rawSurveyIds: unknown, authorisedSurveyIds: Iterable<string>): StudyDraftResult {
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!name) return { ok: false, error: "A study name is required." };
  if (name.length > STUDY_NAME_MAX) return { ok: false, error: `Study name must be ${STUDY_NAME_MAX} characters or fewer.` };

  const submitted = cleanIds(rawSurveyIds);
  const authorised = new Set(authorisedSurveyIds);
  const unauthorised = submitted.filter((id) => !authorised.has(id));
  // Fail closed: reject if ANY submitted id is not in the authorised universe.
  if (unauthorised.length > 0) return { ok: false, error: "One or more selected surveys aren't available to you." };
  if (submitted.length < STUDY_MIN_SURVEYS) return { ok: false, error: `Select at least ${STUDY_MIN_SURVEYS} surveys.` };

  return { ok: true, name, surveyIds: submitted };
}

/** Whether the caller has enough eligible surveys for creating a Study to be useful. */
export function canCreateStudy(authorisedSurveyCount: number): boolean {
  return authorisedSurveyCount >= STUDY_MIN_SURVEYS;
}
