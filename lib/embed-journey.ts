// Shared survey-journey resolution for the embed surface.
//
// WHY THIS EXISTS
// The Studio builder preview showed "Topic: Women's Football" while the full
// Preview and the deployed campaign did not. The Topic was stored correctly on
// surveys.topic and both renderers accept it (`introTopic`), but the embed page
// never supplied it — the builder preview passes it straight from local state,
// so only that one surface had it.
//
// The fix is not another per-surface patch. This module resolves the journey
// fields ONCE so every context — Studio full preview, Deploy inline preview,
// ad-ops review link and production delivery — renders from the same source.
// Pair it with lib/embed-creative.ts, which does the same for the creative.
import { resolveQuestion, resolveText, type LangCode, type LocalisedQuestion, type LocalisedText } from "@/lib/survey-locale";
import { resolveSystemThankYou, isSystemThankYouSurvey } from "@/lib/system-thankyou";

/** The survey columns the journey resolver reads. */
export type SurveyJourneyRow = {
  questions?: unknown;
  topic?: string | null;
  intro_enabled?: boolean | null;
  intro_title?: unknown;
  intro_body?: unknown;
  thank_you_title?: unknown;
  thank_you_body?: unknown;
  thank_you_enabled?: boolean | null;
};

export type ResolvedJourney = {
  questions: ReturnType<typeof resolveQuestion>[];
  intro_enabled: boolean | null;
  intro_title: string | null;
  intro_body: string | null;
  /** Short, optional, NON-localised survey subject (surveys.topic), rendered as
   *  "Topic: …" on the survey intro frame. Distinct from the Stack campaign
   *  Topic in lib/embed-creative.ts, which is a creative-level override. */
  intro_topic: string | null;
  thank_you_title: string;
  thank_you_body: string;
  thank_you_system: boolean;
  thank_you_enabled: boolean | null;
};

const FALLBACK_TY_TITLE = "Thank you!";
const FALLBACK_TY_BODY  = "Your anonymous feedback helps improve the football experience for fans everywhere.";

export function resolveSurveyJourney(row: SurveyJourneyRow, lang: LangCode): ResolvedJourney {
  const questions = ((row.questions ?? []) as LocalisedQuestion[]).map(q => resolveQuestion(q, lang));

  const introTitle = resolveText((row.intro_title as LocalisedText | null) ?? {}, lang);
  const introBody  = resolveText((row.intro_body  as LocalisedText | null) ?? {}, lang);

  // Mandatory system-owned Thank-You for Studio-journey surveys (intro_enabled set).
  // Historical surveys (intro_enabled NULL) keep their own authored thank-you.
  const systemTy = isSystemThankYouSurvey(row.intro_enabled ?? null) ? resolveSystemThankYou(lang) : null;

  return {
    questions,
    // Phase 3 Survey-journey fields. intro_enabled NULL/false ⇒ no survey-level
    // intro; thank_you_enabled NULL ⇒ enabled (historical default), false ⇒ off.
    // The raw tri-state passes through (null for legacy surveys). Coercing
    // NULL→false here would make Stack — whose intro is historically ALWAYS ON —
    // drop its intro on live campaigns. The renderer decides the default per
    // mechanic (Stack: on; Timer/Studio Classic: off) from null/undefined.
    intro_enabled: row.intro_enabled ?? null,
    intro_title:   introTitle || null,
    intro_body:    introBody  || null,
    intro_topic:   (row.topic ?? "").trim() || null,
    thank_you_title: systemTy ? systemTy.title : (resolveText((row.thank_you_title as LocalisedText | null) ?? {}, lang) || FALLBACK_TY_TITLE),
    thank_you_body:  systemTy ? systemTy.body  : (resolveText((row.thank_you_body  as LocalisedText | null) ?? {}, lang) || FALLBACK_TY_BODY),
    thank_you_system: !!systemTy,
    thank_you_enabled: row.thank_you_enabled ?? null,
  };
}

/** Columns any embed route must select for resolveSurveyJourney to be complete.
 *  Kept here so a route cannot silently omit one — omitting `topic` is exactly
 *  how the Topic went missing from every surface except the builder preview. */
export const SURVEY_JOURNEY_COLUMNS =
  "questions, topic, intro_enabled, intro_title, intro_body, thank_you_title, thank_you_body, thank_you_enabled";
