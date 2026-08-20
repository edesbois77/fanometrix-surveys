// ── Resolving WHICH configuration governs a serve, and for how long ──────────
// Pure. The caller fetches a group's revisions; this module decides which one
// is authoritative right now and when that answer stops being safe to cache.

import type { Revision } from "./model";

/**
 * The effective revision at `now`: the latest revision whose effective_at has
 * passed and which has NOT been cancelled.
 *
 * `cancelled_at IS NULL` is a correctness requirement, not a tidy-up. A
 * cancelled revision must never be selected, never be validated against, and
 * never be reported as having governed anything — it was withdrawn before it
 * could take effect. Migration 210's partial unique index and serve index both
 * carry the same predicate so the database agrees with this function.
 *
 * Ties on effective_at cannot occur among live revisions (the partial unique
 * index forbids them), but the ordering below still breaks ties by created_at
 * then id so the result is total and matches the SQL index exactly.
 */
export function effectiveRevision(revisions: Revision[], now: Date): Revision | null {
  const live = revisions
    .filter(r => r.cancelledAt === null && r.effectiveAt.getTime() <= now.getTime())
    .sort(compareRevisionsDesc);
  return live[0] ?? null;
}

/** The soonest revision that has not yet taken effect, if any. */
export function nextPendingRevision(revisions: Revision[], now: Date): Revision | null {
  const pending = revisions
    .filter(r => r.cancelledAt === null && r.effectiveAt.getTime() > now.getTime())
    .sort((a, b) => -compareRevisionsDesc(a, b));
  return pending[0] ?? null;
}

function compareRevisionsDesc(a: Revision, b: Revision): number {
  const byEffective = b.effectiveAt.getTime() - a.effectiveAt.getTime();
  if (byEffective !== 0) return byEffective;
  const byCreated = b.createdAt.getTime() - a.createdAt.getTime();
  if (byCreated !== 0) return byCreated;
  return b.id.localeCompare(a.id);
}

/** Default serve-cache lifetime when nothing is scheduled. */
export const DEFAULT_CACHE_TTL_MS = 60_000;

/**
 * How long the resolved configuration may be cached.
 *
 * A scheduled revision is a PROMISE that the configuration changes at a stated
 * instant. Caching past that instant would serve the superseded configuration
 * while telling the operator the new one is live, so the TTL is clamped to end
 * no later than the next pending revision's effective_at. If that instant is
 * already upon us the answer is zero: do not cache at all, resolve again.
 *
 * There is no scheduler in WP1. This clamp is precisely what makes a scheduled
 * revision take effect on time without one — the next request after the
 * boundary re-resolves and sees the new revision.
 */
export function cacheTtlMs(
  revisions: Revision[],
  now: Date,
  defaultTtlMs: number = DEFAULT_CACHE_TTL_MS,
): number {
  const next = nextPendingRevision(revisions, now);
  if (!next) return Math.max(0, defaultTtlMs);
  const untilBoundary = next.effectiveAt.getTime() - now.getTime();
  return Math.max(0, Math.min(defaultTtlMs, untilBoundary));
}

// ── In-flight validation ────────────────────────────────────────────────────

export type RevisionValidationCode =
  | "ok"
  | "cancelled"
  | "not_yet_effective"
  | "not_in_group"
  | "unknown_revision";

export interface RevisionValidation {
  code: RevisionValidationCode;
  ok: boolean;
  message: string;
}

/**
 * Validate a configuration_revision_id supplied by an IN-FLIGHT survey session.
 *
 * The browser tells us which revision it was serving under so that answers
 * recorded minutes after a configuration change are still attributed to the
 * configuration that produced them. That claim is checked, never trusted.
 *
 * What a pass means, exactly: this revision BELONGS to this group, was not
 * cancelled, and its effective_at has passed — that is, it WAS ELIGIBLE TO
 * GOVERN A SERVE. It is deliberately not phrased as "genuinely governed a
 * serve". Fanometrix has no assignment ledger in WP1: nothing records that this
 * particular session was handed this particular revision, so the strongest
 * statement the data supports is eligibility, not delivery. Anyone reading
 * revision-attributed evidence should read it that way.
 *
 * A revision that is still pending fails: it could not have been serving when
 * the session began, so a session claiming it is either clock-skewed or forged.
 */
export function validateInFlightRevision(
  claimedRevisionId: string,
  groupId: string,
  revisions: Revision[],
  now: Date,
): RevisionValidation {
  const rev = revisions.find(r => r.id === claimedRevisionId);
  if (!rev) {
    return { code: "unknown_revision", ok: false, message: "Revision does not exist." };
  }
  if (rev.groupId !== groupId) {
    return { code: "not_in_group", ok: false, message: "Revision belongs to a different group." };
  }
  if (rev.cancelledAt !== null) {
    return { code: "cancelled", ok: false, message: "Revision was cancelled and never took effect." };
  }
  if (rev.effectiveAt.getTime() > now.getTime()) {
    return { code: "not_yet_effective", ok: false, message: "Revision has not taken effect yet." };
  }
  return { code: "ok", ok: true, message: "Revision was eligible to govern a serve." };
}
