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
  MAX_QUESTIONS:  3,
  MAX_OPTIONS:    4,
  MAX_Q_CHARS:    70,
  MAX_OPT_CHARS:  32,
  MAX_TY_TITLE:   40,
  MAX_TY_BODY:    90,
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
  const { MAX_QUESTIONS, MAX_OPTIONS, MAX_Q_CHARS, MAX_OPT_CHARS, MAX_TY_TITLE, MAX_TY_BODY } = SURVEY_LIMITS;

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

  return errors;
}

/** Convenience wrapper — true when the survey passes all MPU limits */
export function isSurveyValidForReady(survey: SurveyForValidation): boolean {
  return validateSurvey(survey).length === 0;
}
