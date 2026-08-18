// ── Survey localisation completeness + validity ──────────────────────────────
// One source of truth for "is the Publisher-authored survey content COMPLETE and
// VALID in each required delivery language?" — consumed by the Survey-stage
// language pills AND the Create-stage Campaigns gate, so both agree.
//
// A language is COMPLETE (green) only when every required Publisher-authored field
// that exists in the actual survey (a) has content in that language AND (b)
// satisfies the Studio authoring constraints for that field. So a machine
// translation that fills every empty field but produces an over-length value is
// NOT complete — the pill stays red until it is both present and within limits.
//
// Scope (settled):
//   • Publisher-authored fields only: question text, each authored answer option,
//     and the Intro headline/body WHEN the Intro is included.
//   • Topic is optional/non-localised → excluded. The system-owned Thank-You is
//     centrally translated → NEVER counted.
//   • Only fields that actually exist are counted — never phantom Q2–Q5.
//   • English is the canonical base and is validated the same way (it is NOT
//     automatically complete just because it is the source language).
//
// Limits: questions/answers use the tighter STUDIO_AUTHORING_LIMITS (45 / 24);
// intro copy uses the existing MAX_INTRO_TITLE / MAX_INTRO_BODY (40 / 90). These
// are the AUTHORING limits — the renderer/historical ceiling (SURVEY_LIMITS 70/32)
// is unchanged elsewhere.

import type { LocalisedQuestion, LocalisedText } from "@/lib/survey-locale";
import { SURVEY_LIMITS, STUDIO_AUTHORING_LIMITS } from "@/lib/survey-validation";

const Q_MAX = STUDIO_AUTHORING_LIMITS.MAX_Q_CHARS;   // 45
const OPT_MAX = STUDIO_AUTHORING_LIMITS.MAX_OPT_CHARS; // 24
const INTRO_T_MAX = SURVEY_LIMITS.MAX_INTRO_TITLE;   // 40
const INTRO_B_MAX = SURVEY_LIMITS.MAX_INTRO_BODY;    // 90
const MIN_OPTS = SURVEY_LIMITS.MIN_OPTIONS;          // 2

export interface LanguageStatus {
  lang: string;
  total: number;    // required Publisher-authored fields (that have English content)
  filled: number;   // of those, how many have NON-EMPTY text in this language (presence)
  complete: boolean; // present AND valid (within authoring limits) for every field
}

export interface LocalisationStatus {
  englishValid: boolean;          // English base is structurally complete AND valid
  perLanguage: LanguageStatus[];  // one per delivery language (incl. "en")
  allComplete: boolean;           // every delivery language complete (valid)
}

export interface LocalisableContent {
  questions: LocalisedQuestion[];
  introEnabled: boolean;
  introTitle: LocalisedText;
  introBody: LocalisedText;
}

const en = (t: LocalisedText): string => (t?.en ?? "").trim();
const inLang = (t: LocalisedText, lang: string): string =>
  ((t as Record<string, string> | null | undefined)?.[lang] ?? "").trim();

/** A field is valid in a language when it is non-empty AND within its limit. */
const validField = (text: string, max: number): boolean => text.length > 0 && text.length <= max;

/** The Publisher-authored fields carrying English content (the localisation set),
 *  with each field's authoring limit — used for presence + validity checks. */
function authoredFields(content: LocalisableContent): { field: LocalisedText; max: number }[] {
  const fields: { field: LocalisedText; max: number }[] = [];
  for (const q of content.questions) {
    if (en(q.text)) fields.push({ field: q.text, max: Q_MAX });
    for (const o of q.options) if (en(o.text)) fields.push({ field: o.text, max: OPT_MAX });
  }
  if (content.introEnabled) {
    if (en(content.introTitle)) fields.push({ field: content.introTitle, max: INTRO_T_MAX });
    if (en(content.introBody)) fields.push({ field: content.introBody, max: INTRO_B_MAX });
  }
  return fields;
}

/** English base validity: every question has valid text and EVERY answer slot it
 *  carries is filled + within the limit; intro copy valid if included. The answer
 *  count is whatever the question actually has (4 for new Studio questions; 2–3 for
 *  preserved historical surveys) — all of those slots are required, so an empty
 *  Answer 3 or 4 makes the question incomplete. Slots are never manufactured. */
function englishStructureValid(content: LocalisableContent): boolean {
  if (content.questions.length === 0) return false;
  for (const q of content.questions) {
    if (!validField(en(q.text), Q_MAX)) return false;
    if (q.options.length < MIN_OPTS) return false; // a question needs at least the minimum
    for (const o of q.options) {
      if (!validField(en(o.text), OPT_MAX)) return false; // every answer slot must be present + valid
    }
  }
  if (content.introEnabled) {
    if (!validField(en(content.introTitle), INTRO_T_MAX)) return false;
    if (!validField(en(content.introBody), INTRO_B_MAX)) return false;
  }
  return true;
}

export function computeLocalisationStatus(
  content: LocalisableContent,
  deliveryLanguages: string[],
): LocalisationStatus {
  const englishValid = englishStructureValid(content);
  const fields = authoredFields(content);
  const total = fields.length;

  const perLanguage: LanguageStatus[] = deliveryLanguages.map((lang) => {
    if (lang === "en") {
      // English: presence is trivially met for authored fields; completeness is
      // the base structural validity.
      return { lang, total, filled: total, complete: englishValid };
    }
    let filled = 0;
    let allValid = englishValid; // if English isn't valid, no language can be complete
    for (const { field, max } of fields) {
      const t = inLang(field, lang);
      if (t.length > 0) filled++;
      if (!validField(t, max)) allValid = false; // missing OR over-limit ⇒ not complete
    }
    return { lang, total, filled, complete: total > 0 && allValid };
  });

  const allComplete = perLanguage.every((l) => l.complete);
  return { englishValid, perLanguage, allComplete };
}
