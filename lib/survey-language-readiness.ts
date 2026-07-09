// Shared cross-check between a survey's completed translations and the
// countries a Research Project intends to deploy to. Single source of truth
// for the "which countries would Generate Deployments reject" question —
// used by the Research Projects list page, the Research Project Workspace's
// Deployment Readiness step, and the shared GenerateDeploymentsCard, so the
// three never drift out of sync with each other or with the server-side
// check inside generate-deployments/route.ts.
import { expectedSurveyLanguage, LANGUAGE_DISPLAY_NAMES } from "@/lib/locales";
import type { LangCode } from "@/lib/survey-locale";

export type LanguageMismatch = { code: string; lang: string };

/** Countries whose expected survey language isn't among the survey's completed languages. */
export function missingLanguageCountries(
  completedLanguages: LangCode[],
  countryCodes: string[] | undefined
): LanguageMismatch[] {
  if (!countryCodes?.length) return [];
  return countryCodes
    .map(code => ({ code, lang: expectedSurveyLanguage(code) }))
    .filter(({ lang }) => !completedLanguages.includes(lang as LangCode));
}

export function languageLabel(code: string): string {
  return LANGUAGE_DISPLAY_NAMES[code] ?? code;
}
