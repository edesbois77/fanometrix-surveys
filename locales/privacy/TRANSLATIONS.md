# Privacy Policy Translations

Privacy translations are derived from `en.json`.
**Any policy change must be made in English first, then translated into other locales.**

## Source of truth

`locales/privacy/en.json` is the master policy document.

All other locale files (`de.json`, `fr.json`, `es.json`, `it.json`, `pt.json`, `sv.json`, `zh.json`, `hi.json`) are translations of that master. They must never diverge in legal meaning from the English version.

The `discrepancy` field in every locale file states:
> "In the event of any discrepancy between translations of this Privacy Policy, the English version shall prevail."

## Version tracking

Every locale file contains a `_version` integer that matches the English master when the translation is up to date.

| File    | Language            | When in sync     |
|---------|---------------------|------------------|
| en.json | English (master)    | Always           |
| de.json | German              | When `_version` matches `en.json` |
| fr.json | French              | When `_version` matches `en.json` |
| es.json | Spanish             | When `_version` matches `en.json` |
| it.json | Italian             | When `_version` matches `en.json` |
| pt.json | Portuguese          | When `_version` matches `en.json` |
| sv.json | Swedish             | When `_version` matches `en.json` |
| zh.json | Chinese (Simplified)| When `_version` matches `en.json` |
| hi.json | Hindi               | When `_version` matches `en.json` |

## Updating the privacy policy

1. **Edit `en.json`** — make your policy changes in English.
2. **Bump `_version`** — increment the `_version` number by 1 in `en.json`.
3. **Check which translations are behind:**
   ```
   npm run sync:privacy
   ```
4. **Write English placeholders into outdated locales** (optional, helps translators):
   ```
   npm run sync:privacy -- --fill
   ```
   This copies the English text into outdated locale files with a
   `[NEEDS TRANSLATION]` prefix so translators can see exactly what changed.
5. **Translate** — replace all `[NEEDS TRANSLATION]` text with the correct translation.
6. **Mark as done** — set `"_version"` in each updated locale file to match `en.json`.
7. **Verify:**
   ```
   npm run sync:privacy
   ```
   All locales should show `✅ IN SYNC`.

## Live fallback behaviour

The privacy page (`app/[lang]/privacy/page.tsx`) applies a per-field English
fallback at render time. If any field in a locale file is empty or missing,
the English value is shown instead. This means:

- **The site never breaks** due to a missing or partial translation.
- **Users see correct (English) text** rather than gaps.
- **The sync script tells you** what needs translating — the site handles it gracefully in the meantime.

## Adding a new language

1. Copy `en.json` to `[lang].json` (e.g. `nl.json`).
2. Translate all fields. Set `_version` to match `en.json`.
3. Add the lang to `LOCALES` in `app/[lang]/privacy/page.tsx`.
4. Add the lang to `LANG_LINKS` in the same file.
5. Add the lang to `SUPPORTED_LANGS` in `app/embed/page.tsx`.
6. Add the lang to `LANGS` in `scripts/sync-privacy-translations.ts`.
