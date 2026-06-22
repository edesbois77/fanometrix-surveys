/**
 * Survey localisation helpers.
 *
 * Single source of truth for supported languages and the logic to resolve a
 * localised question/option to a plain string for a given language.
 *
 * Rules:
 *   - English ("en") is always the canonical source and the required language.
 *   - Any other language falls back to "en" when its translation is absent.
 *   - Option IDs are stable integers (1-based) — they are stored in responses
 *     instead of text so that reports aggregate correctly across languages.
 */

export const SUPPORTED_LANGUAGES = [
  { code: "en",    label: "English",           nativeLabel: "English"  },
  { code: "de",    label: "German",            nativeLabel: "Deutsch"  },
  { code: "sv",    label: "Swedish",           nativeLabel: "Svenska"  },
  { code: "zh-CN", label: "Chinese Simplified", nativeLabel: "中文"    },
] as const;

export type LangCode = typeof SUPPORTED_LANGUAGES[number]["code"];

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
 * Return true if every option in every question has an English translation.
 * Used to guard against serving a survey with missing EN fallback text.
 */
export function isLocalisedSurveyComplete(questions: LocalisedQuestion[]): boolean {
  return questions.every(q =>
    !!q.text.en?.trim() &&
    q.options.every(o => !!o.text.en?.trim())
  );
}

/**
 * Return the list of languages that have a COMPLETE translation for every
 * question and option in the survey (i.e. no field is blank for that language).
 */
export function getCompletedLanguages(questions: LocalisedQuestion[]): LangCode[] {
  return SUPPORTED_LANGUAGES
    .map(l => l.code)
    .filter(lang =>
      questions.every(q =>
        !!q.text[lang]?.trim() &&
        q.options.every(o => !!o.text[lang]?.trim())
      )
    );
}
