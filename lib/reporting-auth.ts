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
//
// ORG-005 · IW-10 / F052 (D-F052 Option A): the credential is accepted ONLY via
// the `Authorization: Bearer <key>` header. The former `?api_key=<key>` URL
// query-parameter path has been REMOVED so the secret can no longer land in
// request URLs / access logs (G2). Consumers must send the header.
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
 * matching credential via the `Authorization: Bearer <key>` header.
 *
 * The `?api_key=` URL query-parameter path was removed under ORG-005 IW-10
 * (F052 / D-F052 Option A) so the key can never appear in request URLs or
 * access logs (G2). Header-only.
 *
 * Fails closed (returns false) whenever the key is absent, empty or
 * whitespace-only — missing security configuration must never produce ALLOW.
 */
export function isReportingAuthorized(
  authorizationHeader: string | null | undefined,
  key: string | null | undefined,
): boolean {
  const configured = key?.trim();
  if (!configured) return false; // fail closed — never open when unconfigured

  if (authorizationHeader && safeEqual(authorizationHeader, `Bearer ${configured}`)) return true;
  return false;
}

/** Whether a usable Reporting API key is configured (non-empty after trim).
 *  Used only for the non-sensitive `api_key_configured` status flag. */
export function isReportingKeyConfigured(key: string | null | undefined): boolean {
  return !!key?.trim();
}
