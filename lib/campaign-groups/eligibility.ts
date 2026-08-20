// ── Eligibility: which members of an effective revision may serve ────────────
// Pure. Takes already-fetched facts and returns a decision per member with a
// stated reason, so Manage can show an operator exactly why a group is serving
// nothing instead of leaving them to guess.
//
// ROUTING CONTEXT IS NOT ATTRIBUTION. `country`, `market` and `publisher` here
// arrive from the embed URL, which is written by whoever builds the ad tag. We
// use them to ROUTE (pick a campaign whose configured market matches what the
// caller claims), and we never persist them as facts about the impression.
// What gets persisted is resolved server-side from the chosen campaign row —
// see attribution.ts.

import type { RevisionMember } from "./model";

export type ExclusionReason =
  | "paused"
  | "campaign_missing"
  | "campaign_deleted"
  | "campaign_not_live"
  | "not_started"
  | "ended"
  | "country_mismatch"
  | "market_mismatch"
  | "publisher_mismatch"
  | "target_reached"
  | "survey_missing"
  | "survey_invalid";

/** Server-resolved facts about a candidate campaign. */
export interface CampaignFacts {
  id: string;
  slug: string;
  status: string;
  deletedAt: string | null;
  /** Absolute instants, already converted from market-local dates by the caller. */
  startsAt: Date | null;
  endsAt: Date | null;
  countryCode: string | null;
  market: string | null;
  /** Resolved organisation NAME, not the id — the URL claim is a name. */
  publisherName: string | null;
  publisherOrgId: string | null;
  targetResponses: number | null;
  responseCount: number;
  surveyId: string | null;
  surveyValid: boolean;
}

/** Unverified claims from the embed URL. Used for routing only. */
export interface RoutingContext {
  country: string | null;   // ISO-3166 alpha-2, upper-cased by the caller
  market: string | null;
  publisher: string | null;
}

export interface MemberDecision {
  member: RevisionMember;
  eligible: boolean;
  reason: ExclusionReason | null;
}

/**
 * Evaluate one member.
 *
 * Null-on-the-campaign means WILDCARD throughout, matching the legacy path: a
 * campaign with no country_code accepts any country, a campaign with no
 * publisher accepts any publisher. This is deliberate — narrowing it would
 * silently stop serving live inventory — and is asserted by test.
 */
export function evaluateMember(
  member: RevisionMember,
  facts: CampaignFacts | undefined,
  ctx: RoutingContext,
  now: Date,
): MemberDecision {
  const no = (reason: ExclusionReason): MemberDecision => ({ member, eligible: false, reason });

  if (member.membershipState === "paused") return no("paused");
  if (!facts) return no("campaign_missing");
  if (facts.deletedAt) return no("campaign_deleted");
  if (facts.status !== "live") return no("campaign_not_live");
  if (facts.startsAt && facts.startsAt.getTime() > now.getTime()) return no("not_started");
  if (facts.endsAt && facts.endsAt.getTime() < now.getTime()) return no("ended");

  if (ctx.country && facts.countryCode && facts.countryCode.toUpperCase() !== ctx.country) {
    return no("country_mismatch");
  }
  if (ctx.market && facts.market && facts.market.trim().toLowerCase() !== ctx.market.trim().toLowerCase()) {
    return no("market_mismatch");
  }
  if (ctx.publisher && facts.publisherName && facts.publisherName.toLowerCase() !== ctx.publisher.toLowerCase()) {
    return no("publisher_mismatch");
  }

  if (facts.targetResponses !== null && facts.responseCount >= facts.targetResponses) {
    return no("target_reached");
  }
  if (!facts.surveyId) return no("survey_missing");
  if (!facts.surveyValid) return no("survey_invalid");

  return { member, eligible: true, reason: null };
}

export function evaluateMembers(
  members: RevisionMember[],
  factsById: Map<string, CampaignFacts>,
  ctx: RoutingContext,
  now: Date,
): MemberDecision[] {
  return members.map(m => evaluateMember(m, factsById.get(m.campaignId), ctx, now));
}

/** Human-readable diagnosis for Manage. Never shown to a survey respondent. */
export const EXCLUSION_COPY: Record<ExclusionReason, string> = {
  paused:              "Paused in this configuration",
  campaign_missing:    "Campaign no longer exists",
  campaign_deleted:    "Campaign deleted",
  campaign_not_live:   "Campaign is not live",
  not_started:         "Campaign has not started",
  ended:               "Campaign has ended",
  country_mismatch:    "Configured for a different country",
  market_mismatch:     "Configured for a different market",
  publisher_mismatch:  "Configured for a different publisher",
  target_reached:      "Response target reached",
  survey_missing:      "No survey attached",
  survey_invalid:      "Survey does not pass validation",
};
