// ── Survey stage — shared types & small factories (Phase 3, refined) ─────────
// The Survey journey the fan travels: optional Intro → 1–5 Questions → a
// MANDATORY system-owned Thank You. CreateWorkspace owns the persisted content
// state (autosaved through the same GET/PUT survey path as About/Creative); the
// Survey-stage components are presentational and receive the content + change
// handlers.
//
// The Thank-You frame is Fanometrix-owned (see lib/system-thankyou.ts) and is NOT
// authored here — so SurveyContent carries NO thank-you copy fields. `topic` is a
// short, optional, NON-localised survey subject persisted to surveys.topic
// (distinct from the About Objective).

import type { LocalisedQuestion, LocalisedText, LangCode } from "@/lib/survey-locale";
import { SUPPORTED_LANGUAGES } from "@/lib/survey-locale";
import { resolveText } from "@/lib/survey-locale";
import { SURVEY_LIMITS, STUDIO_AUTHORING_LIMITS } from "@/lib/survey-validation";
import { inferLanguagesForMarkets } from "@/lib/locales";

/** The full editable survey journey content, grouped for one autosave payload.
 *  Thank-You is system-owned (mandatory) and therefore NOT part of this shape. */
export interface SurveyContent {
  questions: LocalisedQuestion[];
  introEnabled: boolean;
  introTitle: LocalisedText;
  introBody: LocalisedText;
  /** Short, optional, NON-localised survey subject → surveys.topic. */
  topic: string;
}

/** Which journey step the main editor pane is currently showing. */
export type Selection =
  | { kind: "intro" }
  | { kind: "question"; id: string }
  | { kind: "thankyou" };

/** Which journey frame the integrated Preview renders. Matches the (incoming)
 *  CreativeDesignPreview `frame` contract from the renderer stream. */
export type PreviewFrame =
  | { kind: "intro" }
  | { kind: "question"; index: number }
  | { kind: "thankyou" };

/** The EXACT research-definition-lock copy. Product-settled. The lock applies once
 *  the survey is live or has begun collecting — even before any response arrives —
 *  so questions and answer options can no longer be added, removed, reordered or
 *  reworded. Matches the server rule (evidence OR live campaign). */
export const STRUCTURE_LOCKED_COPY =
  "Questions and answer options are locked because this survey is live or has begun collecting responses. To protect the research, they can no longer be changed, even if no responses have arrived yet. Duplicate the survey to ask something different.";

/** A fresh blank option with a stable 1-based id. */
export function blankOption(id: number) {
  return { id, text: {} as LocalisedText };
}

/** A fresh blank question with `optionCount` blank options (default = the
 *  standard four; the Survey stage passes the selected Creative's answer count).
 *  IDs use the same `q<epoch>` convention as the legacy editor. Never called
 *  during render (only from load / event handlers), so Date.now() is
 *  React-Compiler safe here. */
export function blankQuestion(optionCount: number = SURVEY_LIMITS.MAX_OPTIONS): LocalisedQuestion {
  const n = Math.max(SURVEY_LIMITS.MIN_OPTIONS, Math.min(optionCount, SURVEY_LIMITS.MAX_OPTIONS));
  const id = `q${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return {
    id,
    // Comparability anchor seeded to the question's own id (Study analysis, later).
    // Duplicate copies the questions jsonb verbatim, so cloned questions share this key.
    canonical_question_key: id,
    text: {},
    options: Array.from({ length: n }, (_, i) => blankOption(i + 1)),
  };
}

/** Resolve a language list (enabled_languages) to valid LangCodes, always
 *  including English as the canonical base and first entry. */
export function resolveEditingLanguages(languages: string[], supported: readonly { code: LangCode }[]): LangCode[] {
  const valid = supported.map((l) => l.code);
  const codes = languages.filter((l): l is LangCode => (valid as string[]).includes(l));
  const withEn = codes.includes("en") ? codes : (["en", ...codes] as LangCode[]);
  // Keep English first for a stable base-language switcher, de-duped.
  return ["en", ...withEn.filter((c, i, a) => c !== "en" && a.indexOf(c) === i)] as LangCode[];
}

/** The Survey stage's editable delivery-language set. Derived from the About
 *  markets via the GOVERNED inferLanguagesForMarkets mapping, unioned with any
 *  languages already stored on the survey (enabled_languages) so a language a
 *  publisher legitimately added earlier is never silently dropped. English is
 *  always present and first (the canonical base). */
export function resolveDeliveryLanguages(markets: string[], enabledLanguages: string[]): LangCode[] {
  const fromMarkets = inferLanguagesForMarkets(markets);
  return resolveEditingLanguages([...fromMarkets, ...enabledLanguages], SUPPORTED_LANGUAGES);
}

/** Count answer options that have non-empty English base text (the validated
 *  base). Used for journey completeness without re-implementing validation. */
export function filledOptionCount(q: LocalisedQuestion): number {
  return q.options.filter((o) => resolveText(o.text, "en").trim().length > 0).length;
}

export { SURVEY_LIMITS, STUDIO_AUTHORING_LIMITS };
