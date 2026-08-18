/**
 * Shared survey validation — used in:
 *   - Survey builder (client-side, real-time feedback)
 *   - Surveys API PUT route (server-side guard before saving as Ready)
 *   - Embed routes (block serving invalid surveys)
 *   - Campaign form (filter survey dropdown)
 *
 * All limits correspond to the 300×250 MPU creative constraints.
 *
 * Supports BOTH the legacy flat shape { text: string, options: string[] }
 * and the new localised shape { text: {en: string}, options: [{id, text: {en: string}}] }.
 * In the localised shape, only the English ("en") text is validated — translations
 * are optional and have no character-limit enforcement here. thank_you_title/body
 * follow the same rule: either a plain string or a {en: string, ...} object.
 */

export const SURVEY_LIMITS = {
  // Phase 3 (Survey Studio): the product journey is optional Intro → 1–5 Questions
  // → optional Thank You. Question count is a SURVEY product rule (not a Creative
  // rule). MIN/MAX_OPTIONS = 2–4, portable across Countdown / Stack / Studio Classic.
  MIN_QUESTIONS:  1,
  MAX_QUESTIONS:  5,
  MIN_OPTIONS:    2,
  MAX_OPTIONS:    4,
  MAX_Q_CHARS:    70,
  MAX_OPT_CHARS:  32,
  MAX_TY_TITLE:   40,
  MAX_TY_BODY:    90,
  // Survey-level Intro copy limits (mirror the Thank-You limits).
  MAX_INTRO_TITLE: 40,
  MAX_INTRO_BODY:  90,
} as const;

// ── Studio authoring guidance (multilingual-safe) ────────────────────────────
// SURVEY_LIMITS above is the RENDERER / historical compatibility CEILING (what a
// renderer tolerates and what old surveys were authored against — never lowered,
// so no historical content is retroactively invalidated). STUDIO_AUTHORING_LIMITS
// is the tighter guidance for NEW Survey Studio authoring only: English source
// text kept short enough that natural translation expansion (e.g. German ~+35%)
// still fits the tightest V1 renderer (Countdown's 2-line question clamp and
// answer font-shrink). Enforced in the Studio editor UI (maxLength + counters);
// the shared server validateSurvey keeps SURVEY_LIMITS so existing drafts and
// historical rows stay valid.
export const STUDIO_AUTHORING_LIMITS = {
  MAX_Q_CHARS:   45,
  MAX_OPT_CHARS:  24,
} as const;

type AnyQuestion = {
  text:    string | Record<string, string>;
  options: (string | { text: string | Record<string, string> })[];
};

export type SurveyForValidation = {
  name?:            string | null;
  questions?:       AnyQuestion[] | null;
  thank_you_title?: string | Record<string, string> | null;
  thank_you_body?:  string | Record<string, string> | null;
  intro_title?:     string | Record<string, string> | null;
  intro_body?:      string | Record<string, string> | null;
};

/** Extract the English validation text from either question shape */
function qText(q: AnyQuestion): string {
  if (typeof q.text === "string") return q.text;
  return (q.text as Record<string, string>)["en"] ?? "";
}

/** Extract the English option text from either option shape */
function optText(o: string | { text: string | Record<string, string> }): string {
  if (typeof o === "string") return o;
  const t = o.text;
  if (typeof t === "string") return t;
  return (t as Record<string, string>)["en"] ?? "";
}

/** Extract the English text from either the legacy flat string or localised object shape */
function localisedText(v: string | Record<string, string> | null | undefined): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  return v["en"] ?? "";
}

/**
 * Returns an array of human-readable error strings.
 * Empty array means the survey is valid.
 */
export function validateSurvey(survey: SurveyForValidation): string[] {
  const errors: string[] = [];
  const { MAX_QUESTIONS, MAX_OPTIONS, MAX_Q_CHARS, MAX_OPT_CHARS, MAX_TY_TITLE, MAX_TY_BODY, MAX_INTRO_TITLE, MAX_INTRO_BODY } = SURVEY_LIMITS;

  if (!survey.name?.trim()) {
    errors.push("Survey name is required.");
  }

  const qs = survey.questions ?? [];

  if (qs.length === 0) {
    errors.push("At least one question is required.");
  } else if (qs.length > MAX_QUESTIONS) {
    errors.push(`Maximum ${MAX_QUESTIONS} questions allowed (found ${qs.length}).`);
  }

  for (let i = 0; i < qs.length; i++) {
    const q      = qs[i];
    const qLabel = `Q${i + 1}`;
    const qt     = qText(q);

    if (!qt.trim()) {
      errors.push(`${qLabel}: question text is required.`);
    } else if (qt.length > MAX_Q_CHARS) {
      errors.push(`${qLabel}: question text exceeds ${MAX_Q_CHARS} characters (${qt.length}).`);
    }

    const filledOptions = (q.options ?? []).filter(o => optText(o).trim());
    if (filledOptions.length < 2) {
      errors.push(`${qLabel}: at least 2 answers are required.`);
    }
    if ((q.options ?? []).length > MAX_OPTIONS) {
      errors.push(`${qLabel}: maximum ${MAX_OPTIONS} answers allowed (found ${q.options.length}).`);
    }
    for (let j = 0; j < (q.options ?? []).length; j++) {
      const ot = optText(q.options[j]);
      if (ot.trim().length > MAX_OPT_CHARS) {
        errors.push(`${qLabel}, answer ${j + 1}: exceeds ${MAX_OPT_CHARS} characters.`);
      }
    }
  }

  if (localisedText(survey.thank_you_title).length > MAX_TY_TITLE) {
    errors.push(`Thank-you title exceeds ${MAX_TY_TITLE} characters.`);
  }
  if (localisedText(survey.thank_you_body).length > MAX_TY_BODY) {
    errors.push(`Thank-you message exceeds ${MAX_TY_BODY} characters.`);
  }

  // Intro copy is optional; when present the English text must fit the frame.
  // (Whether an Intro is shown is a Survey journey toggle, not validated here.)
  if (localisedText(survey.intro_title).length > MAX_INTRO_TITLE) {
    errors.push(`Intro headline exceeds ${MAX_INTRO_TITLE} characters.`);
  }
  if (localisedText(survey.intro_body).length > MAX_INTRO_BODY) {
    errors.push(`Intro message exceeds ${MAX_INTRO_BODY} characters.`);
  }

  return errors;
}

/** Convenience wrapper — true when the survey passes all MPU limits */
export function isSurveyValidForReady(survey: SurveyForValidation): boolean {
  return validateSurvey(survey).length === 0;
}

/**
 * Optional organisation reference columns on `surveys` — uuid in the DB.
 * The Create/Edit Survey drawer defaults these to "" (an unselected
 * picker), which Postgres rejects for a uuid ("invalid input syntax for
 * type uuid"). Both survey write routes run a payload through
 * `nullifyBlankUuids` before the DB call so a blank Brand/Agency saves as
 * null rather than crashing the save.
 */
export const SURVEY_UUID_FIELDS = ["brand_org_id", "agency_org_id"] as const;

export function nullifyBlankUuids(payload: Record<string, unknown>): Record<string, unknown> {
  const out = { ...payload };
  for (const field of SURVEY_UUID_FIELDS) {
    if (out[field] === "") out[field] = null;
  }
  return out;
}

/** A fetched organisation row, minimally, for reference validation. */
export type OrgRefRow = { id: string; type: string; deleted_at: string | null };

/**
 * Validate Brand/Agency attribution references against the CORRECT organisation
 * type. Pure — `rows` are the organisations fetched for the referenced ids. Guards
 * the trusted boundary against a client posting an arbitrary UUID, a wrong-type org
 * (e.g. a publisher org as "Brand"), or a soft-deleted org. Null/blank references
 * are fine (attribution is optional). Returns an error message, or null when valid.
 *
 * Brands/agencies are GLOBAL reference data (visible to every authenticated user),
 * so there is no per-organisation access check to make — only type/existence.
 */
export function brandAgencyRefError(brandOrgId: unknown, agencyOrgId: unknown, rows: OrgRefRow[]): string | null {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const check = (id: unknown, type: "brand" | "agency", label: string): string | null => {
    if (typeof id !== "string" || id === "") return null; // absent / cleared — allowed
    const row = byId.get(id);
    if (!row || row.deleted_at || row.type !== type) return `Invalid ${label} selection.`;
    return null;
  };
  return check(brandOrgId, "brand", "Brand") ?? check(agencyOrgId, "agency", "Agency");
}
