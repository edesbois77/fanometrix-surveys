// ── Creative compatibility (Survey Studio Create) ────────────────────────────
// Pure check run when a draft's Creative TYPE is CHANGED after content exists:
// does the survey's current content still fit the new mechanic's GENUINE RENDERER
// constraints? It reports ONLY content that would not fit and NEVER mutates or
// deletes anything — the caller blocks the switch and shows reasons.
//
// Deliberately NOT checked here: question COUNT. The 1–3 cap is a temporary
// response-capture/data-layer limit (Phase 6), not a per-mechanic renderer
// constraint, so it must not gate a Creative-type switch. Intro capability comes
// from the MECHANIC (Classic cannot render an intro), not the mis-valued
// `rules.introSupported` flag.
//
// In V1 a draft's content is typically empty (the Survey stage is Phase 3), so
// switches are compatible; this is built now, pure and future-proof.

export interface SurveyContentSummary {
  questionCount: number;
  maxOptionsPerQuestion: number;
  maxQuestionChars: number;
  maxOptionChars: number;
  hasIntro: boolean;
}

/** Genuine renderer/mechanic constraints for the target Creative type. */
export interface RendererConstraints {
  maxOptions: number;
  maxQChars: number;
  maxOptChars: number;
  supportsIntro: boolean;
}

export interface CompatibilityIssue {
  message: string;
}

export interface CompatibilityResult {
  compatible: boolean;
  issues: CompatibilityIssue[];
}

/** PURE. compatible=true when all existing content fits the target mechanic's
 *  renderer constraints; otherwise the explicit list of what does not fit. */
export function checkCreativeCompatibility(content: SurveyContentSummary, constraints: RendererConstraints): CompatibilityResult {
  const issues: CompatibilityIssue[] = [];

  if (content.hasIntro && !constraints.supportsIntro) {
    issues.push({ message: "This survey uses an intro; this creative type doesn't have one." });
  }
  if (content.maxOptionsPerQuestion > constraints.maxOptions) {
    issues.push({
      message: `A question has ${content.maxOptionsPerQuestion} answers; this creative allows up to ${constraints.maxOptions}.`,
    });
  }
  if (content.maxQuestionChars > constraints.maxQChars) {
    issues.push({ message: `A question is longer than this creative allows (${constraints.maxQChars} characters).` });
  }
  if (content.maxOptionChars > constraints.maxOptChars) {
    issues.push({ message: `An answer is longer than this creative allows (${constraints.maxOptChars} characters).` });
  }

  return { compatible: issues.length === 0, issues };
}

// ── Deriving the summary from a survey row ───────────────────────────────────
// The survey's `questions` jsonb is a LocalisedQuestion[] (each has localised
// `text` and `options[].text`). Lengths are measured across all present
// languages (the longest wins, so a translation can't silently overflow). Intro
// is Phase-6 content (no column yet) → treated as absent.

type Localised = Record<string, unknown> | null | undefined;

function longestLocalised(t: Localised): number {
  if (!t || typeof t !== "object") return 0;
  let max = 0;
  for (const v of Object.values(t)) if (typeof v === "string") max = Math.max(max, v.length);
  return max;
}

export function summariseSurveyContent(survey: {
  questions?: unknown;
  intro?: unknown;
}): SurveyContentSummary {
  const questions = Array.isArray(survey.questions) ? (survey.questions as Array<Record<string, unknown>>) : [];
  let maxOptionsPerQuestion = 0;
  let maxQuestionChars = 0;
  let maxOptionChars = 0;

  for (const q of questions) {
    maxQuestionChars = Math.max(maxQuestionChars, longestLocalised(q.text as Localised));
    const options = Array.isArray(q.options) ? (q.options as Array<Record<string, unknown>>) : [];
    maxOptionsPerQuestion = Math.max(maxOptionsPerQuestion, options.length);
    for (const o of options) maxOptionChars = Math.max(maxOptionChars, longestLocalised(o.text as Localised));
  }

  // Intro is Phase-6 first-class content; until then a draft has no intro.
  const intro = survey.intro as Localised;
  const hasIntro = !!intro && typeof intro === "object" && longestLocalised(intro) > 0;

  return {
    questionCount: questions.length,
    maxOptionsPerQuestion,
    maxQuestionChars,
    maxOptionChars,
    hasIntro,
  };
}
