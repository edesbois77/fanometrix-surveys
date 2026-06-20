/**
 * Privacy Translation Sync Tool
 * ─────────────────────────────
 * Compares every locale file against the English master (locales/privacy/en.json).
 * Detects missing keys, wrong section counts, and version drift.
 *
 * Usage:
 *   npm run sync:privacy           — check status of all translations
 *   npm run sync:privacy -- --fill — copy English text as placeholders into
 *                                    outdated locales so translators can see
 *                                    exactly what needs updating
 *
 * Workflow when you update the English policy:
 *   1. Edit locales/privacy/en.json — make your changes
 *   2. Bump "_version" by 1 in en.json
 *   3. Run:  npm run sync:privacy
 *            → shows which locales are now behind
 *   4. Run:  npm run sync:privacy -- --fill
 *            → copies English text as [NEEDS TRANSLATION] placeholders
 *   5. Send the updated locale files to your translator
 *   6. Translator replaces [NEEDS TRANSLATION] text with the translation
 *   7. Translator bumps "_version" in each locale file to match en.json
 *   8. Run:  npm run sync:privacy
 *            → confirms all translations are in sync
 */

import fs   from "fs";
import path from "path";

const LOCALES_DIR = path.join(__dirname, "..", "locales", "privacy");
const LANGS       = ["de", "fr", "es", "it", "pt", "sv", "zh", "hi"] as const;
const FILL        = process.argv.includes("--fill");

// ─── Types (mirrors the JSON structure) ──────────────────────────────────────
type Section = {
  heading: string;
  body:    string[];
  table?:  { f: string; d: string }[];
  list?:   string[];
};

type PrivacyLocale = {
  _version:       number;
  lang:           string;
  langName:       string;
  nativeName:     string;
  title:          string;
  subtitle:       string;
  updated:        string;
  sections:       Section[];
  contactHeading: string;
  contactBody:    string;
  contactEmail:   string;
  discrepancy:    string;
  languagesLabel: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function load(lang: string): PrivacyLocale {
  const p = path.join(LOCALES_DIR, `${lang}.json`);
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function save(lang: string, data: PrivacyLocale): void {
  const p = path.join(LOCALES_DIR, `${lang}.json`);
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function placeholder(text: string): string {
  return `[NEEDS TRANSLATION] ${text}`;
}

const STRING_KEYS: (keyof PrivacyLocale)[] = [
  "title", "subtitle", "updated",
  "contactHeading", "contactBody", "discrepancy", "languagesLabel",
];

// ─── Main ─────────────────────────────────────────────────────────────────────
const en = load("en");

console.log();
console.log("Fanometrix Privacy Policy — Translation Sync");
console.log("════════════════════════════════════════════");
console.log(`Master: locales/privacy/en.json  (version ${en._version})`);
console.log();

let allInSync = true;

for (const lang of LANGS) {
  let locale: PrivacyLocale;
  try {
    locale = load(lang);
  } catch {
    console.log(`❌ ${lang.padEnd(3)}  FILE MISSING — create locales/privacy/${lang}.json`);
    allInSync = false;
    continue;
  }

  const issues: string[] = [];
  let needsSave         = false;

  // 1. Version
  if (locale._version !== en._version) {
    issues.push(
      `version ${locale._version ?? "unset"} → master is version ${en._version}`
    );
  }

  // 2. Section count
  const enSections     = en.sections;
  const localeSections = locale.sections ?? [];

  if (localeSections.length !== enSections.length) {
    issues.push(
      `section count: ${localeSections.length} (master has ${enSections.length})`
    );
  }

  // 3. Missing sections — fill if requested
  for (let i = localeSections.length; i < enSections.length; i++) {
    const enS = enSections[i];
    issues.push(`missing section [${i}]: "${enS.heading}"`);

    if (FILL) {
      const filled: Section = {
        heading: placeholder(enS.heading),
        body:    enS.body.map(placeholder),
      };
      if (enS.table) filled.table = enS.table.map(r => ({ f: placeholder(r.f), d: placeholder(r.d) }));
      if (enS.list)  filled.list  = enS.list.map(placeholder);
      locale.sections.push(filled);
      needsSave = true;
    }
  }

  // 4. Missing top-level string keys — fill if requested
  for (const key of STRING_KEYS) {
    if (!locale[key]) {
      issues.push(`missing key: "${key}"`);
      if (FILL) {
        (locale as Record<string, unknown>)[key] = placeholder(en[key] as string);
        needsSave = true;
      }
    }
  }

  // 5. Print result
  const name = `(${locale.nativeName ?? locale.lang})`.padEnd(22);
  if (issues.length === 0) {
    console.log(`✅ ${lang.padEnd(3)} ${name}— version ${locale._version}  IN SYNC`);
  } else {
    allInSync = false;
    console.log(`⚠️  ${lang.padEnd(3)} ${name}— NEEDS UPDATE`);
    for (const issue of issues) {
      console.log(`      • ${issue}`);
    }

    if (FILL && needsSave) {
      save(lang, locale);
      console.log(
        `      → Placeholders written. Translate [NEEDS TRANSLATION] ` +
        `sections, then set "_version": ${en._version} in ${lang}.json`
      );
    }
  }
}

console.log();

if (allInSync) {
  console.log(`✓ All translations match en.json version ${en._version}.`);
} else if (!FILL) {
  console.log(
    "Run with --fill to copy English placeholders into outdated locales:\n" +
    "  npm run sync:privacy -- --fill"
  );
}

console.log();
