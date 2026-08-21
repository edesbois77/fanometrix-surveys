// -- The ONE definition of what stops a member serving -----------------------
//
// Two evaluators consume this list and they must never disagree:
//
//   evaluateMember()        the SERVE path. Walks until the FIRST blocker and
//                           stops. It runs on every impression and only needs a
//                           decision, not a diagnosis.
//   assessServeReadiness()  the PRODUCT UI. Walks the WHOLE list, because an
//                           operator asking "why will this not serve?" is badly
//                           served by being told one reason at a time.
//
// Before this module the rules lived inline in evaluateMember. Adding a second
// evaluator by copying them would have created exactly the drift this list
// exists to prevent - the selector saying a campaign is fine while the serve
// path refuses it, or worse, the reverse.
//
// ORDER IS PART OF THE CONTRACT. evaluateMember returns the first match, so the
// sequence below IS its historical short-circuit order, preserved exactly. Its
// 29 existing tests pass unmodified against this list, which is the proof.

import type { CampaignFacts, RoutingContext } from "./eligibility";
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

export interface PredicateInput {
  member: RevisionMember;
  facts: CampaignFacts | undefined;
  ctx: RoutingContext;
  now: Date;
}

export interface Predicate {
  reason: ExclusionReason;
  /** True when this predicate BLOCKS the member. */
  blocks(input: PredicateInput): boolean;
  /** Operator-facing copy. Never shown to a survey respondent. */
  copy: string;
  /**
   * When true, a later predicate cannot be meaningfully evaluated because the
   * facts themselves are absent. assessServeReadiness stops collecting here —
   * reporting "no survey attached" about a campaign that does not exist would
   * be noise, not detail.
   */
  terminal?: boolean;
}

/**
 * THE list. Order is evaluateMember's short-circuit order and must not change
 * without accepting that its historical behaviour changes with it.
 */
export const PREDICATES: Predicate[] = [
  {
    reason: "paused",
    blocks: ({ member }) => member.membershipState === "paused",
    copy: "Paused in this configuration",
    terminal: true,
  },
  {
    reason: "campaign_missing",
    blocks: ({ facts }) => !facts,
    copy: "Campaign no longer exists",
    terminal: true,
  },
  {
    reason: "campaign_deleted",
    blocks: ({ facts }) => !!facts?.deletedAt,
    copy: "Campaign deleted",
    terminal: true,
  },
  {
    reason: "campaign_not_live",
    blocks: ({ facts }) => !!facts && facts.status !== "live",
    copy: "Campaign is not live",
  },
  {
    reason: "not_started",
    blocks: ({ facts, now }) =>
      !!facts?.startsAt && facts.startsAt.getTime() > now.getTime(),
    copy: "Campaign has not started",
  },
  {
    reason: "ended",
    blocks: ({ facts, now }) =>
      !!facts?.endsAt && facts.endsAt.getTime() < now.getTime(),
    copy: "Campaign has ended",
  },
  {
    reason: "country_mismatch",
    blocks: ({ facts, ctx }) =>
      !!ctx.country && !!facts?.countryCode &&
      facts.countryCode.toUpperCase() !== ctx.country,
    copy: "Configured for a different country",
  },
  {
    reason: "market_mismatch",
    blocks: ({ facts, ctx }) =>
      !!ctx.market && !!facts?.market &&
      facts.market.trim().toLowerCase() !== ctx.market.trim().toLowerCase(),
    copy: "Configured for a different market",
  },
  {
    reason: "publisher_mismatch",
    blocks: ({ facts, ctx }) =>
      !!ctx.publisher && !!facts?.publisherName &&
      facts.publisherName.toLowerCase() !== ctx.publisher.toLowerCase(),
    copy: "Configured for a different publisher",
  },
  {
    reason: "target_reached",
    blocks: ({ facts }) =>
      !!facts && facts.targetResponses !== null &&
      facts.responseCount >= facts.targetResponses,
    copy: "Response target reached",
  },
  {
    reason: "survey_missing",
    blocks: ({ facts }) => !!facts && !facts.surveyId,
    copy: "No survey attached",
  },
  {
    reason: "survey_invalid",
    blocks: ({ facts }) => !!facts && !!facts.surveyId && !facts.surveyValid,
    copy: "Survey does not pass validation",
  },
];

/** Operator-facing copy, derived from the list so the two cannot drift. */
export const EXCLUSION_COPY: Record<ExclusionReason, string> =
  Object.fromEntries(PREDICATES.map(p => [p.reason, p.copy])) as Record<ExclusionReason, string>;
