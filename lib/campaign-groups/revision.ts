// ── Resolving WHICH configuration governs a serve, and for how long ──────────
// Pure. The caller fetches a group's revisions; this module decides which one
// is authoritative right now and when that answer stops being safe to cache.

import type { Revision } from "./model";
import { OWNER_MODEL } from "./model";

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

/**
 * Why a configuration claim was accepted or refused.
 *
 * These are the SAME codes the request-side resolver reports, so there is one
 * vocabulary end to end rather than a validator dialect translated at the edge.
 * `no_claim` and `malformed_claim` cannot arise here — this function is only
 * reached once a well-formed id has been supplied — but they belong to the same
 * union so a caller can switch over one exhaustive type.
 */
export type RevisionValidationCode =
  | "valid"
  | "no_claim"
  | "malformed_claim"
  | "unknown_revision"
  | "cancelled_revision"
  | "future_revision"
  | "wrong_group"
  | "campaign_not_in_revision"
  | "invalid_owner_model";

export interface RevisionValidation {
  code: RevisionValidationCode;
  ok: boolean;
  message: string;
}

/** What the caller knows about the write being attributed. */
export interface InFlightClaim {
  /** The revision id echoed by the in-flight session. */
  revisionId: string;
  /** The campaign slug (campaigns.campaign_id) the evidence is being written for. */
  campaignSlug: string;
  /**
   * The group slug the session claims, when the caller has one. Optional
   * BECAUSE the claim is not always accompanied by a group — but when it is
   * absent the campaign-membership check below still pins the tuple, so an
   * absent group can never widen what is accepted.
   */
  groupSlug?: string | null;
  /** campaign_groups.owner_model of the revision's group. */
  ownerModel: string;
  /** The group slug the revision ACTUALLY belongs to. */
  actualGroupSlug: string;
}

/**
 * Validate a configuration_revision_id supplied by an IN-FLIGHT survey session.
 *
 * The browser tells us which revision it was serving under so that answers
 * recorded minutes after a configuration change are still attributed to the
 * configuration that produced them. That claim is checked, never trusted.
 *
 * WHAT A PASS MEANS, EXACTLY. This revision exists, belongs to a Survey Studio
 * campaign group, belongs to the claimed group when one was claimed, was not
 * cancelled, its effective_at has passed, and THE CLAIMED CAMPAIGN IS ONE OF ITS
 * FROZEN MEMBERS — that is, it WAS ELIGIBLE TO GOVERN THIS SERVE. It is
 * deliberately not phrased as "genuinely governed this serve". WP1 keeps no
 * assignment ledger: nothing records that this session was handed this revision,
 * so eligibility is the strongest statement the data supports, and evidence read
 * downstream must be read that way.
 *
 * THE TUPLE IS THE POINT. Validating the revision alone is not enough, and
 * neither is resolving "the campaign's group" — a campaign may sit in several
 * groups and in several revisions of each. Only the exact
 * (revision, campaign, group-where-known) tuple, checked against the FROZEN
 * membership of that one revision, distinguishes a genuine claim from another
 * group's revision replayed against this campaign.
 */
export function validateInFlightRevision(
  claim: InFlightClaim,
  revisions: Revision[],
  now: Date,
): RevisionValidation {
  const rev = revisions.find(r => r.id === claim.revisionId);
  if (!rev) {
    return { code: "unknown_revision", ok: false, message: "Revision does not exist." };
  }
  // Only Survey Studio groups mint these claims. A revision belonging to a
  // legacy research-project group cannot have governed a Studio serve, so
  // accepting one would attribute Studio evidence to a configuration from a
  // different product surface entirely.
  if (claim.ownerModel !== OWNER_MODEL.studio) {
    return { code: "invalid_owner_model", ok: false, message: "Revision does not belong to a Survey Studio campaign group." };
  }
  if (claim.groupSlug != null && claim.groupSlug !== claim.actualGroupSlug) {
    return { code: "wrong_group", ok: false, message: "Revision belongs to a different group." };
  }
  if (rev.cancelledAt !== null) {
    return { code: "cancelled_revision", ok: false, message: "Revision was cancelled and never took effect." };
  }
  if (rev.effectiveAt.getTime() > now.getTime()) {
    return { code: "future_revision", ok: false, message: "Revision has not taken effect yet." };
  }
  // The membership check that makes the tuple authoritative. Note it reads the
  // revision's OWN frozen member list, never the group's current membership:
  // a campaign removed by a later revision must still validate against the
  // revision that was serving when the respondent answered.
  const isMember = rev.members.some(m => m.campaignSlug === claim.campaignSlug);
  if (!isMember) {
    return { code: "campaign_not_in_revision", ok: false, message: "Campaign is not a member of this revision." };
  }
  return { code: "valid", ok: true, message: "Revision was eligible to govern this serve." };
}
