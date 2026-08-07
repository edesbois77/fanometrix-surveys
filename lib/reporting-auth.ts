// Authentication for the external Reporting API routes (/api/reporting and
// /api/reporting/stats). These serve campaign-response data to an external
// consumer (e.g. Looker Studio) via a static API key, NOT a browser session,
// so they are excluded from the session-auth middleware and enforce their own
// credential check here.
//
// This deliberately mirrors lib/jobs/cron-auth.ts:
//   - Fails CLOSED when the key is unset, empty or whitespace-only, so a
//     missing/misconfigured env var can NEVER be read as "open". (This replaces
//     the previous `if (!API_KEY) return true` fail-open behaviour.)
//   - Constant-time comparison so a caller can't recover the key byte-by-byte
//     from response timing.
import { timingSafeEqual } from "node:crypto";

function safeEqual(provided: string, expected: string): boolean {
  const p = Buffer.from(provided);
  const e = Buffer.from(expected);
  // timingSafeEqual requires equal lengths; an unequal length is itself a
  // mismatch, and returning early here leaks only length, never content.
  if (p.length !== e.length) return false;
  return timingSafeEqual(p, e);
}

/**
 * True only when a Reporting API key is configured AND the request presents a
 * matching credential, via either `Authorization: Bearer <key>` or an
 * `api_key=<key>` query parameter.
 *
 * Fails closed (returns false) whenever the key is absent, empty or
 * whitespace-only — missing security configuration must never produce ALLOW.
 */
export function isReportingAuthorized(
  authorizationHeader: string | null | undefined,
  apiKeyQuery: string | null | undefined,
  key: string | null | undefined,
): boolean {
  const configured = key?.trim();
  if (!configured) return false; // fail closed — never open when unconfigured

  if (authorizationHeader && safeEqual(authorizationHeader, `Bearer ${configured}`)) return true;
  if (apiKeyQuery && safeEqual(apiKeyQuery, configured)) return true;
  return false;
}

/** Whether a usable Reporting API key is configured (non-empty after trim).
 *  Used only for the non-sensitive `api_key_configured` status flag. */
export function isReportingKeyConfigured(key: string | null | undefined): boolean {
  return !!key?.trim();
}
