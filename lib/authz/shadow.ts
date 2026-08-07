// ORG-005 · IW-0 — Shadow-mode observation for the authorisation decision seam.
//
// The seam runs alongside the legacy authorisation path in SHADOW mode: the
// legacy outcome remains AUTHORITATIVE, and the seam's decision is only
// compared and recorded. This is the no-authorisation-gap migration evidence
// primitive (frozen plan §4). It MUST NEVER affect a request — every call site
// wraps it so a shadow error is swallowed.
//
// Counters are per-serverless-instance (in-memory); durable aggregation, if
// needed later, is a separate decision. Divergences (which should be zero while
// the seam mirrors current semantics) also emit a structured runtime-log line.

import { compareToLegacy, type AuthzResult } from "./decision";

export interface ShadowStats {
  evaluated: number;
  divergent: number;
  lastDivergenceAt: number | null;
  lastDivergenceSite: string | null;
}

const stats: ShadowStats = { evaluated: 0, divergent: 0, lastDivergenceAt: null, lastDivergenceSite: null };

/**
 * Record one shadow comparison. `legacyAllowed` is the authoritative legacy
 * outcome; the seam decision is observational. Never throws. Divergence is
 * measured on EFFECT (allow vs deny) — the seam adding INDETERMINATE vocabulary
 * for a case the legacy path denies is NOT an effect divergence.
 */
export function recordShadow(site: string, result: AuthzResult, legacyAllowed: boolean): void {
  try {
    const cmp = compareToLegacy(result, legacyAllowed);
    stats.evaluated++;
    if (cmp.divergent) {
      stats.divergent++;
      stats.lastDivergenceAt = Date.now();
      stats.lastDivergenceSite = site;
      // Structured, PII-free: decision codes + site only. Never logs identity,
      // resource ids, or secrets.
      console.warn(`[authz-shadow] DIVERGENCE site=${site} seam=${cmp.seam} legacyAllowed=${legacyAllowed}`);
    }
  } catch {
    // Shadow observation must never break authorisation.
  }
}

/** Snapshot of this instance's shadow counters (for the admin diagnostic). */
export function shadowStats(): ShadowStats {
  return { ...stats };
}

/** Test-only reset. */
export function __resetShadow(): void {
  stats.evaluated = 0;
  stats.divergent = 0;
  stats.lastDivergenceAt = null;
  stats.lastDivergenceSite = null;
}
