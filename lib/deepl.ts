// Shared DeepL translation core — the single place the DeepL HTTP call and the
// Fanometrix→DeepL language mapping live, reused by BOTH the admin translate
// endpoint (app/api/translate) and the Survey-scoped Publisher translate endpoint
// (app/api/surveys/[id]/translate). There is exactly ONE translation provider.
//
// Source language is always English (the V1 canonical authoring language).

// Map Fanometrix language codes → DeepL target language codes.
// Keep in sync with lib/survey-locale.ts SUPPORTED_LANGUAGES' autoTranslatable
// flag — a language marked autoTranslatable:true must have an entry here.
// Hindi, Bengali and Urdu are intentionally absent: DeepL doesn't support them.
export const DEEPL_LANG: Record<string, string> = {
  en:      "EN-GB",
  de:      "DE",
  sv:      "SV",
  "zh-CN": "ZH",   // DeepL uses ZH for Chinese Simplified
  es:      "ES",
  fr:      "FR",
  ar:      "AR",
  pt:      "PT-PT",
  ru:      "RU",
  it:      "IT",
  nl:      "NL",
  pl:      "PL",
  ja:      "JA",
  ko:      "KO",
  tr:      "TR",
  da:      "DA",
  nb:      "NB",
  fi:      "FI",
  el:      "EL",
  cs:      "CS",
  hu:      "HU",
  ro:      "RO",
  sk:      "SK",
  sl:      "SL",
  bg:      "BG",
  uk:      "UK",
  id:      "ID",
  lt:      "LT",
  lv:      "LV",
  et:      "ET",
};

/** True when the language can be machine-translated by DeepL (has a mapping). */
export function isDeeplTranslatable(fanometrixLang: string): boolean {
  return !!DEEPL_LANG[fanometrixLang];
}

export type DeeplResult =
  | { ok: true; translations: string[] }
  | { ok: false; status: number; error: string };

/**
 * Translate an array of English strings into one target language via DeepL.
 * Returns a discriminated result the caller maps to an HTTP response — never
 * throws for the expected failure modes (missing key, unsupported lang, DeepL
 * error). Order of `translations` matches `texts`.
 */
export async function translateTexts(texts: string[], targetLang: string): Promise<DeeplResult> {
  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 503, error: "DEEPL_API_KEY is not configured." };
  }
  if (!Array.isArray(texts) || texts.length === 0) {
    return { ok: false, status: 400, error: "texts (non-empty array) is required." };
  }
  const deeplLang = DEEPL_LANG[targetLang];
  if (!deeplLang) {
    return { ok: false, status: 400, error: `Unsupported target language: ${targetLang}` };
  }

  // DeepL free-tier endpoint — paid plans use api.deepl.com
  const url = apiKey.endsWith(":fx")
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: texts, source_lang: "EN", target_lang: deeplLang }),
    });
  } catch (e) {
    console.error("[deepl] network error:", e);
    return { ok: false, status: 502, error: "Translation service unreachable." };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[deepl] DeepL error:", res.status, text);
    return { ok: false, status: 502, error: `Translation failed (DeepL ${res.status}). Check the API key and usage limits.` };
  }

  const json = await res.json().catch(() => null);
  const translations: string[] = (json?.translations ?? []).map((t: { text: string }) => t.text);
  return { ok: true, translations };
}
