// Admin-only endpoint — translates survey text via DeepL.
// Requires DEEPL_API_KEY in Vercel environment variables.
// Sign up for a free key at deepl.com/pro-api (500,000 chars/month free).
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";

// Map Fanometrix language codes → DeepL target language codes.
// Keep in sync with lib/survey-locale.ts SUPPORTED_LANGUAGES' autoTranslatable
// flag — a language marked autoTranslatable:true must have an entry here.
// Hindi, Bengali and Urdu are intentionally absent: DeepL doesn't support
// them, so those languages are marked autoTranslatable:false and translated
// manually in the builder instead.
const DEEPL_LANG: Record<string, string> = {
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

export async function POST(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "DEEPL_API_KEY is not configured. Add it to your Vercel environment variables." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.texts?.length || !body?.targetLang) {
    return NextResponse.json({ error: "texts (array) and targetLang are required." }, { status: 400 });
  }

  const deeplLang = DEEPL_LANG[body.targetLang as string];
  if (!deeplLang) {
    return NextResponse.json({ error: `Unsupported target language: ${body.targetLang}` }, { status: 400 });
  }

  // DeepL free-tier endpoint — paid plans use api.deepl.com
  const url = apiKey.endsWith(":fx")
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text:        body.texts as string[],
      source_lang: "EN",
      target_lang: deeplLang,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[translate] DeepL error:", res.status, text);
    return NextResponse.json(
      { error: `Translation failed (DeepL ${res.status}). Check your API key and usage limits.` },
      { status: 502 }
    );
  }

  const json = await res.json();
  const translations: string[] = json.translations.map(
    (t: { text: string }) => t.text
  );

  return NextResponse.json({ translations });
}
