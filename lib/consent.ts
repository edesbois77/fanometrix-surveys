// First-party analytics consent for the PUBLIC MARKETING website.
//
// Deny-by-default: Google Analytics and Microsoft Clarity only load after the
// visitor explicitly accepts. The choice is stored in a first-party cookie so
// it persists across pages/visits. This module is the single source of truth
// shared by the banner, the analytics gate, and the footer "Cookie Settings"
// link — it is entirely separate from, and has no effect on, the strictly
// necessary authentication/session cookies used by the app.

export type ConsentChoice = "granted" | "denied";

export const CONSENT_COOKIE = "fx-analytics-consent";
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

// Window events used to keep the banner and the analytics gate in sync without
// a shared React tree/provider.
export const CONSENT_CHANGED_EVENT = "fx:consent-changed";
export const OPEN_SETTINGS_EVENT = "fx:open-cookie-settings";

export function readConsent(): ConsentChoice | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)fx-analytics-consent=(granted|denied)\b/);
  return m ? (m[1] as ConsentChoice) : null;
}

export function writeConsent(choice: ConsentChoice): void {
  if (typeof document === "undefined") return;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${choice}; Max-Age=${CONSENT_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: choice }));
}

// Subscribe to consent changes — for React's useSyncExternalStore, so the
// analytics gate and banner re-read the cookie reactively (and stay SSR-safe)
// without calling setState inside an effect.
export function subscribeConsent(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CONSENT_CHANGED_EVENT, callback);
  return () => window.removeEventListener(CONSENT_CHANGED_EVENT, callback);
}

// Re-open the banner so a visitor can change or withdraw their choice.
export function openCookieSettings(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT));
}

// The public marketing surface — the ONLY place analytics + the banner appear.
// Explicitly excludes the logged-in app/admin, the fan-facing survey (/survey)
// and the survey embed iframes (/embed), plus /login, /access-denied and APIs.
export function isMarketingPath(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname === "/request-access") return true;
  if (pathname === "/privacy") return true;
  if (/^\/[a-z]{2}\/privacy$/.test(pathname)) return true; // localised privacy
  if (pathname.startsWith("/for-publishers")) return true;
  if (pathname.startsWith("/trust/")) return true;
  if (pathname === "/publisher-hub" || pathname === "/publisher-guide" || pathname === "/fanometrix-guide") return true;
  return false;
}
