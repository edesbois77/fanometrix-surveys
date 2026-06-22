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
const COUNTRY_TO_LANGUAGE: Record<string, string> = {
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
