/**
 * Country codes (ISO 3166-1 alpha-2) and language codes (ISO 639-1 / regional variants).
 *
 * These are always stored and validated independently:
 *   country_code   → routing, reporting, embed URL filtering  (?country=GB)
 *   survey_language → which translation to render in the creative
 *
 * Never derive one from the other. GB ≠ en. SE ≠ sv. IN ≠ en. CN ≠ zh-CN.
 */

// ── Validation helpers ────────────────────────────────────────────────────────

/** Returns true for valid ISO 3166-1 alpha-2 country codes: exactly 2 uppercase letters */
export function isValidCountryCode(code: string): boolean {
  return /^[A-Z]{2}$/.test(code.trim());
}

/** Returns true for valid language codes supported by Fanometrix */
export function isValidLanguageCode(code: string): boolean {
  return SUPPORTED_LANGUAGE_CODES.has(code.trim());
}

/**
 * Returns a warning message when the value entered as a country code looks like
 * a language code — e.g. "sv" instead of "SE" for Sweden.
 */
export function countryCodeWarning(code: string): string | null {
  const raw = code.trim();
  if (!raw) return null;

  // Already a valid country code (2 uppercase letters) — no warning needed
  if (/^[A-Z]{2}$/.test(raw)) return null;

  // Lowercase 2-letter — almost certainly meant the country code, just wrong case
  if (/^[a-z]{2}$/.test(raw)) {
    return `Country codes must be uppercase. Did you mean "${raw.toUpperCase()}"?`;
  }

  // Looks like a language code with regional variant (e.g. zh-CN) entered as country code
  if (/^[a-z]{2}-[A-Z]{2}$/.test(raw)) {
    return `"${raw}" looks like a language code. Country codes are 2 uppercase letters (e.g. GB, DE, SE).`;
  }

  return null;
}

/**
 * Returns a warning message when the value entered as a language code looks like
 * a country code — e.g. "GB" instead of "en".
 */
export function languageCodeWarning(code: string): string | null {
  const raw = code.trim();
  if (!raw) return null;
  if (/^[A-Z]{2}$/.test(raw)) {
    const suggestion = COUNTRY_TO_LANGUAGE[raw];
    return suggestion
      ? `"${raw}" is a country code. Did you mean language "${suggestion}"?`
      : `"${raw}" looks like a country code, not a language code. Language codes are lowercase (e.g. en, de, sv).`;
  }
  return null;
}

// ── Supported language codes ──────────────────────────────────────────────────
// Keep in sync with lib/survey-locale.ts SUPPORTED_LANGUAGES

export const SUPPORTED_LANGUAGE_CODES = new Set(["en", "de", "sv", "zh-CN"]);

const LANGUAGE_CODE_SET = new Set(["en", "de", "sv", "zh", "zh-cn", "fr", "es", "pt", "ar", "ja", "ko", "nl", "pl", "ru", "it"]);

// ── Common confusion mappings ─────────────────────────────────────────────────
// Language code → likely intended country code
const LANGUAGE_TO_COUNTRY: Record<string, string> = {
  en:    "GB",  // or US — most common confusion
  de:    "DE",
  sv:    "SE",
  fr:    "FR",
  es:    "ES",
  pt:    "PT",
  nl:    "NL",
  pl:    "PL",
  it:    "IT",
  ar:    "SA",
  ja:    "JP",
  ko:    "KR",
};

// Country code → survey language (for reference display only — never auto-derive)
export const COUNTRY_TO_LANGUAGE: Record<string, string> = {
  GB: "en",
  US: "en",
  AU: "en",
  DE: "de",
  AT: "de",
  SE: "sv",
  CN: "zh-CN",
  FR: "fr",
  ES: "es",
  IT: "it",
  NL: "nl",
  PL: "pl",
  JP: "ja",
  KR: "ko",
  IN: "en",   // India — English is the survey language used
  SA: "ar",

  // Portuguese
  BR: "pt",   // Brazil
  PT: "pt",   // Portugal
  // Spanish (Spain is above; Latin America here)
  MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", UY: "es",
  // Other markets — each a country's real primary language, so a survey missing
  // it is correctly flagged as a mismatch (all DeepL-authorable, never dead-ends).
  RU: "ru", UA: "uk", TR: "tr",
  NO: "nb", DK: "da", FI: "fi",
  GR: "el", CZ: "cs", HU: "hu", RO: "ro", SK: "sk", SI: "sl", BG: "bg",
  LT: "lt", LV: "lv", EE: "et", ID: "id",
  IE: "en", NZ: "en", ZA: "en", CA: "en", SG: "en",
};

/**
 * The survey language a given country is genuinely expected to have a
 * complete translation for. Only defaults to "en" when the country isn't
 * in COUNTRY_TO_LANGUAGE at all — a known country's real language is always
 * returned as-is, even if Fanometrix surveys can't yet be authored in it
 * (e.g. "it" for Italy). That's the point: a country needing a language the
 * survey has no way of ever containing is a genuine mismatch, not something
 * to silently wave through as "assume English is fine". Used to validate
 * that a Research Project's chosen survey covers every deployment country —
 * never used to auto-set survey_language on a campaign.
 */
export function expectedSurveyLanguage(countryCode: string): string {
  return COUNTRY_TO_LANGUAGE[countryCode.toUpperCase()] ?? "en";
}

/** Human-readable display names for language codes, including ones Fanometrix can't author surveys in yet. */
export const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  en:      "English",
  de:      "German",
  sv:      "Swedish",
  "zh-CN": "Chinese Simplified",
  fr:      "French",
  es:      "Spanish",
  pt:      "Portuguese",
  nl:      "Dutch",
  pl:      "Polish",
  it:      "Italian",
  ar:      "Arabic",
  ja:      "Japanese",
  ko:      "Korean",
  ru:      "Russian",
  uk:      "Ukrainian",
  tr:      "Turkish",
  nb:      "Norwegian",
  da:      "Danish",
  fi:      "Finnish",
  el:      "Greek",
  cs:      "Czech",
  hu:      "Hungarian",
  ro:      "Romanian",
  sk:      "Slovak",
  sl:      "Slovenian",
  bg:      "Bulgarian",
  lt:      "Lithuanian",
  lv:      "Latvian",
  et:      "Estonian",
  id:      "Indonesian",
};

// ── Reference pairs shown in the campaign form ────────────────────────────────
export const MARKET_REFERENCE_PAIRS = [
  { market: "United Kingdom", country_code: "GB", survey_language: "en"    },
  { market: "Germany",        country_code: "DE", survey_language: "de"    },
  { market: "Sweden",         country_code: "SE", survey_language: "sv"    },
  { market: "India",          country_code: "IN", survey_language: "en"    },
  { market: "China",          country_code: "CN", survey_language: "zh-CN" },
  { market: "France",         country_code: "FR", survey_language: "en"    },
  { market: "Spain",          country_code: "ES", survey_language: "en"    },
  { market: "United States",  country_code: "US", survey_language: "en"    },
];
