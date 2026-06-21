/**
 * Shared survey validation — used in:
 *   - Survey builder (client-side, real-time feedback)
 *   - Surveys API PUT route (server-side guard before saving as Ready)
 *   - Embed routes (block serving invalid surveys)
 *   - Campaign form (filter survey dropdown)
 *
 * All limits correspond to the 300×250 MPU creative constraints.
 */

export const SURVEY_LIMITS = {
  MAX_QUESTIONS:  4,
  MAX_OPTIONS:    4,
  MAX_Q_CHARS:    70,
  MAX_OPT_CHARS:  32,
  MAX_TY_TITLE:   40,
  MAX_TY_BODY:    90,
} as const;

export type SurveyForValidation = {
  name?:            string | null;
  questions?:       Array<{ text: string; options: string[] }> | null;
  thank_you_title?: string | null;
  thank_you_body?:  string | null;
};

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
    const q = qs[i];
    const qLabel = `Q${i + 1}`;

    if (!q.text?.trim()) {
      errors.push(`${qLabel}: question text is required.`);
    } else if (q.text.length > MAX_Q_CHARS) {
      errors.push(`${qLabel}: question text exceeds ${MAX_Q_CHARS} characters (${q.text.length}).`);
    }

    const filledOptions = (q.options ?? []).filter(o => o.trim());
    if (filledOptions.length < 2) {
      errors.push(`${qLabel}: at least 2 answers are required.`);
    }
    if ((q.options ?? []).length > MAX_OPTIONS) {
      errors.push(`${qLabel}: maximum ${MAX_OPTIONS} answers allowed (found ${q.options.length}).`);
    }
    for (let j = 0; j < (q.options ?? []).length; j++) {
      if (q.options[j].trim().length > MAX_OPT_CHARS) {
        errors.push(`${qLabel}, answer ${j + 1}: exceeds ${MAX_OPT_CHARS} characters.`);
      }
    }
  }

  if ((survey.thank_you_title?.length ?? 0) > MAX_TY_TITLE) {
    errors.push(`Thank-you title exceeds ${MAX_TY_TITLE} characters.`);
  }
  if ((survey.thank_you_body?.length ?? 0) > MAX_TY_BODY) {
    errors.push(`Thank-you message exceeds ${MAX_TY_BODY} characters.`);
  }

  return errors;
}

/** Convenience wrapper — true when the survey passes all MPU limits */
export function isSurveyValidForReady(survey: SurveyForValidation): boolean {
  return validateSurvey(survey).length === 0;
}
