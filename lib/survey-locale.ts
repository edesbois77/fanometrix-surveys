/**
 * Survey localisation helpers.
 *
 * Single source of truth for supported languages and the logic to resolve a
 * localised question/option/thank-you-screen field to a plain string for a
 * given language.
 *
 * Rules:
 *   - English ("en") is always the canonical source and the required language.
 *   - Any other language falls back to "en" when its translation is absent.
 *   - Option IDs are stable integers (1-based) — they are stored in responses
 *     instead of text so that reports aggregate correctly across languages.
 *
 * Adding a new language: add one entry to SUPPORTED_LANGUAGES below. No other
 * code changes are needed — the builder's "+ Add Language" search, the embed
 * resolvers, and the Research Project language-mismatch check all read from
 * this single list. Set autoTranslatable to whether DeepL supports it
 * (keep DEEPL_LANG in app/api/translate/route.ts in sync); languages DeepL
 * doesn't support can still be added and translated manually.
 */

/**
 * The finite set of language codes surveys can be authored in. Declared
 * explicitly (rather than inferred from SUPPORTED_LANGUAGES) so it stays a
 * literal union — an inferred `code: string` field would widen LangCode to
 * plain `string` and silently break every Partial<Record<LangCode, ...>>
 * check throughout this file.
 */
export type LangCode =
  | "en" | "zh-CN" | "hi" | "es" | "fr" | "ar" | "bn" | "pt" | "ru" | "ur"
  | "de" | "sv" | "it" | "nl" | "pl" | "ja" | "ko" | "tr" | "da" | "nb"
  | "fi" | "el" | "cs" | "hu" | "ro" | "sk" | "sl" | "bg" | "uk" | "id"
  | "lt" | "lv" | "et";

export type LanguageOption = {
  code: LangCode;
  label: string;
  nativeLabel: string;
  /** Whether "Translate from English" (DeepL) can auto-fill this language */
  autoTranslatable: boolean;
  /** One of the ten most-spoken languages in the world — pinned first in the add-language picker */
  topTen?: boolean;
  /** Country/demonym names that should match this language when searched, e.g. "France" → fr */
  countryNames: string[];
};

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  // ── Top 10 world languages by number of speakers ──────────────────────────
  { code: "en",    label: "English",             nativeLabel: "English",           autoTranslatable: true,  topTen: true, countryNames: ["united kingdom", "uk", "england", "britain", "great britain", "united states", "usa", "america", "australia", "ireland", "canada", "new zealand"] },
  { code: "zh-CN", label: "Chinese Simplified",  nativeLabel: "中文",                autoTranslatable: true,  topTen: true, countryNames: ["china", "chinese", "mandarin", "prc"] },
  { code: "hi",    label: "Hindi",               nativeLabel: "हिन्दी",              autoTranslatable: false, topTen: true, countryNames: ["india", "hindi"] },
  { code: "es",    label: "Spanish",             nativeLabel: "Español",           autoTranslatable: true,  topTen: true, countryNames: ["spain", "mexico", "argentina", "colombia", "chile", "peru", "spanish"] },
  { code: "fr",    label: "French",              nativeLabel: "Français",          autoTranslatable: true,  topTen: true, countryNames: ["france", "french", "belgium", "switzerland"] },
  { code: "ar",    label: "Arabic",              nativeLabel: "العربية",            autoTranslatable: true,  topTen: true, countryNames: ["saudi arabia", "uae", "united arab emirates", "egypt", "arabic", "qatar", "kuwait", "bahrain", "oman"] },
  { code: "bn",    label: "Bengali",             nativeLabel: "বাংলা",              autoTranslatable: false, topTen: true, countryNames: ["bangladesh", "bengali", "bengal"] },
  { code: "pt",    label: "Portuguese",          nativeLabel: "Português",         autoTranslatable: true,  topTen: true, countryNames: ["portugal", "brazil", "portuguese"] },
  { code: "ru",    label: "Russian",             nativeLabel: "Русский",           autoTranslatable: true,  topTen: true, countryNames: ["russia", "russian"] },
  { code: "ur",    label: "Urdu",                nativeLabel: "اردو",               autoTranslatable: false, topTen: true, countryNames: ["pakistan", "urdu"] },

  // ── Additional DeepL-supported languages ──────────────────────────────────
  { code: "de", label: "German",     nativeLabel: "Deutsch",         autoTranslatable: true, countryNames: ["germany", "austria", "german"] },
  { code: "sv", label: "Swedish",    nativeLabel: "Svenska",         autoTranslatable: true, countryNames: ["sweden", "swedish"] },
  { code: "it", label: "Italian",    nativeLabel: "Italiano",        autoTranslatable: true, countryNames: ["italy", "italian"] },
  { code: "nl", label: "Dutch",      nativeLabel: "Nederlands",      autoTranslatable: true, countryNames: ["netherlands", "holland", "dutch"] },
  { code: "pl", label: "Polish",     nativeLabel: "Polski",          autoTranslatable: true, countryNames: ["poland", "polish"] },
  { code: "ja", label: "Japanese",   nativeLabel: "日本語",           autoTranslatable: true, countryNames: ["japan", "japanese"] },
  { code: "ko", label: "Korean",     nativeLabel: "한국어",           autoTranslatable: true, countryNames: ["korea", "south korea", "korean"] },
  { code: "tr", label: "Turkish",    nativeLabel: "Türkçe",          autoTranslatable: true, countryNames: ["turkey", "turkish"] },
  { code: "da", label: "Danish",     nativeLabel: "Dansk",           autoTranslatable: true, countryNames: ["denmark", "danish"] },
  { code: "nb", label: "Norwegian",  nativeLabel: "Norsk",           autoTranslatable: true, countryNames: ["norway", "norwegian"] },
  { code: "fi", label: "Finnish",    nativeLabel: "Suomi",           autoTranslatable: true, countryNames: ["finland", "finnish"] },
  { code: "el", label: "Greek",      nativeLabel: "Ελληνικά",        autoTranslatable: true, countryNames: ["greece", "greek"] },
  { code: "cs", label: "Czech",      nativeLabel: "Čeština",         autoTranslatable: true, countryNames: ["czech republic", "czechia", "czech"] },
  { code: "hu", label: "Hungarian",  nativeLabel: "Magyar",          autoTranslatable: true, countryNames: ["hungary", "hungarian"] },
  { code: "ro", label: "Romanian",   nativeLabel: "Română",          autoTranslatable: true, countryNames: ["romania", "romanian"] },
  { code: "sk", label: "Slovak",     nativeLabel: "Slovenčina",      autoTranslatable: true, countryNames: ["slovakia", "slovak"] },
  { code: "sl", label: "Slovenian",  nativeLabel: "Slovenščina",     autoTranslatable: true, countryNames: ["slovenia", "slovenian"] },
  { code: "bg", label: "Bulgarian",  nativeLabel: "Български",       autoTranslatable: true, countryNames: ["bulgaria", "bulgarian"] },
  { code: "uk", label: "Ukrainian",  nativeLabel: "Українська",      autoTranslatable: true, countryNames: ["ukraine", "ukrainian"] },
  { code: "id", label: "Indonesian", nativeLabel: "Bahasa Indonesia", autoTranslatable: true, countryNames: ["indonesia", "indonesian"] },
  { code: "lt", label: "Lithuanian", nativeLabel: "Lietuvių",        autoTranslatable: true, countryNames: ["lithuania", "lithuanian"] },
  { code: "lv", label: "Latvian",    nativeLabel: "Latviešu",        autoTranslatable: true, countryNames: ["latvia", "latvian"] },
  { code: "et", label: "Estonian",   nativeLabel: "Eesti",           autoTranslatable: true, countryNames: ["estonia", "estonian"] },
];

/** Map of language code → translated string.  Only "en" is guaranteed to exist. */
export type LocalisedText = Partial<Record<LangCode, string>>;

export interface LocalisedOption {
  /** Stable 1-based integer — stored in responses for language-independent reporting */
  id: number;
  text: LocalisedText;
}

export interface LocalisedQuestion {
  /** Existing UUID-style question ID, e.g. "q1685932800000" */
  id: string;
  text: LocalisedText;
  options: LocalisedOption[];
}

/** Resolved flat shape returned from embed API — no localisation metadata exposed */
export interface ResolvedQuestion {
  id: string;
  text: string;
  options: { id: number; text: string }[];
}

/** Minimal shape needed to check/resolve a survey's localisation state. */
export interface LocalisableSurvey {
  questions: LocalisedQuestion[];
  thank_you_title?: LocalisedText;
  thank_you_body?: LocalisedText;
}

/**
 * Search the language catalog by code, English label, native label, or an
 * associated country/demonym name — e.g. "France", "French", or "fr" all
 * match the French entry. Powers the builder's "+ Add Language" search.
 * Top-ten languages are returned first when they match.
 */
export function findLanguageMatches(query: string, exclude: string[] = []): LanguageOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const matches = SUPPORTED_LANGUAGES.filter(l =>
    !exclude.includes(l.code) && (
      l.code.toLowerCase().includes(q) ||
      l.label.toLowerCase().includes(q) ||
      l.nativeLabel.toLowerCase().includes(q) ||
      l.countryNames.some(name => name.includes(q))
    )
  );
  return matches.sort((a, b) => (b.topTen ? 1 : 0) - (a.topTen ? 1 : 0));
}

/**
 * Resolve localised text to a plain string.
 * Falls back to English if the requested language has no translation.
 */
export function resolveText(lt: LocalisedText, lang: LangCode): string {
  return (lang !== "en" && lt[lang]) ? lt[lang]! : (lt["en"] ?? "");
}

/**
 * Resolve a full LocalisedQuestion to a plain {id, text, options} shape
 * ready for the embed to render.
 */
export function resolveQuestion(q: LocalisedQuestion, lang: LangCode): ResolvedQuestion {
  return {
    id:      q.id,
    text:    resolveText(q.text, lang),
    options: q.options.map(o => ({
      id:   o.id,
      text: resolveText(o.text, lang),
    })),
  };
}

/**
 * Return true if every question/option — and the thank-you screen, when
 * provided — has an English translation. Used to guard against serving a
 * survey with missing EN fallback text.
 */
export function isLocalisedSurveyComplete(survey: LocalisableSurvey): boolean {
  const questionsOk = survey.questions.every(q =>
    !!q.text.en?.trim() &&
    q.options.every(o => !!o.text.en?.trim())
  );
  const thankYouOk =
    (!survey.thank_you_title || !!survey.thank_you_title.en?.trim()) &&
    (!survey.thank_you_body  || !!survey.thank_you_body.en?.trim());
  return questionsOk && thankYouOk;
}

/**
 * Return the list of languages that have a COMPLETE translation for every
 * question, option, and the thank-you screen (i.e. no field is blank for
 * that language). thank_you_title/body are optional for backward
 * compatibility with any caller that hasn't fetched them.
 */
export function getCompletedLanguages(survey: LocalisableSurvey): LangCode[] {
  const questions = survey.questions ?? [];
  return SUPPORTED_LANGUAGES
    .map(l => l.code)
    .filter(lang => {
      const questionsOk = questions.every(q =>
        !!q.text[lang]?.trim() &&
        q.options.every(o => !!o.text[lang]?.trim())
      );
      const titleOk = !survey.thank_you_title || !!survey.thank_you_title[lang]?.trim();
      const bodyOk  = !survey.thank_you_body  || !!survey.thank_you_body[lang]?.trim();
      return questionsOk && titleOk && bodyOk;
    });
}
