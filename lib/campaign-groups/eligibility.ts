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

// The reason vocabulary and the rules themselves live in ONE place. This module
// keeps its exports so every existing caller and test is unaffected.
import { PREDICATES, EXCLUSION_COPY as PREDICATE_COPY, type ExclusionReason } from "./predicates";
export type { ExclusionReason };

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
  // SHORT-CIRCUIT, preserved exactly. This runs on every impression: it walks
  // PREDICATES in order and returns the FIRST blocker, doing no work beyond it.
  // The order of that list IS this function's historical evaluation order, and
  // its 29 original tests pass unmodified against it.
  const input = { member, facts, ctx, now };
  for (const p of PREDICATES) {
    if (p.blocks(input)) return { member, eligible: false, reason: p.reason };
  }
  return { member, eligible: true, reason: null };
}

/**
 * EVERY applicable reason, for the product UI only.
 *
 * Never call this from the serve path. It deliberately does the work
 * evaluateMember avoids — an operator asking "why will this not serve?" needs
 * the whole answer, while a serve decision needs only the first blocker.
 *
 * Collection stops at a TERMINAL predicate: once a campaign is missing or
 * deleted, reporting "no survey attached" about it as well would be noise
 * dressed as detail.
 */
export function assessServeReadiness(
  member: RevisionMember,
  facts: CampaignFacts | undefined,
  ctx: RoutingContext,
  now: Date,
): { canServeNow: boolean; reasons: ExclusionReason[]; copy: string[] } {
  const input = { member, facts, ctx, now };
  const reasons: ExclusionReason[] = [];
  for (const p of PREDICATES) {
    if (!p.blocks(input)) continue;
    reasons.push(p.reason);
    if (p.terminal) break;
  }
  return {
    canServeNow: reasons.length === 0,
    reasons,
    copy: reasons.map(r => PREDICATE_COPY[r]),
  };
}

export function evaluateMembers(
  members: RevisionMember[],
  factsById: Map<string, CampaignFacts>,
  ctx: RoutingContext,
  now: Date,
): MemberDecision[] {
  return members.map(m => evaluateMember(m, factsById.get(m.campaignId), ctx, now));
}

/** Operator-facing copy. Never shown to a survey respondent. Re-exported from
 *  the predicate list so a reason and its wording cannot drift apart. */
export const EXCLUSION_COPY = PREDICATE_COPY;
