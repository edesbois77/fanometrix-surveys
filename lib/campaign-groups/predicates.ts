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
import { computeEffectiveStatus, type CampaignForStatus } from "@/lib/campaign-status";

/**
 * Statuses that mean DEPLOYED. Both are past the Deploy gate; the difference is
 * only whether the start date has arrived.
 *
 * `resolveDeployTargetStatus` stores "scheduled" for any campaign deployed with a
 * future start date, and NOTHING ever flips that row to "live" — activation is by
 * time, through the effective-status resolver, precisely so no scheduler is
 * needed. Treating stored "live" as the only deployed state therefore meant a
 * scheduled campaign never served, even long after its start date.
 */
const DEPLOYED = new Set(["live", "scheduled"]);

/** Adapt our facts to the shape the authoritative resolver expects. */
function forStatus(f: CampaignFacts): CampaignForStatus {
  return {
    status: f.status,
    manual_status_override: f.manualStatusOverride ?? null,
    start_date: f.startDate ?? null,
    end_date: f.endDate ?? null,
    target_responses: f.targetResponses,
    archive_after_days: f.archiveAfterDays ?? null,
    country_code: f.countryCode,
    target_mode: f.targetMode ?? null,
  } as CampaignForStatus;
}

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
  /**
   * A BACKSTOP blocks like any other predicate, but only CONTRIBUTES its reason
   * when nothing more specific already has.
   *
   * The authoritative effective-status gate is one: for a deployed campaign
   * awaiting its start, the precise reason is "has not started", and adding
   * "is not live" beside it is both redundant and wrong — the campaign IS
   * deployed. The gate still refuses; it just does not narrate.
   */
  backstop?: boolean;
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
    // NOT DEPLOYED — draft, paused, closed or archived. A stored "scheduled"
    // campaign IS deployed and passes here; whether its window has opened is
    // decided by not_started / ended below, which give the precise reason.
    blocks: ({ facts }) => !!facts && !DEPLOYED.has(facts.status),
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
  {
    // THE AUTHORITATIVE LIFECYCLE GATE, deferring to lib/campaign-status.ts —
    // the same resolver /api/embed/campaign uses. The predicates above are
    // DIAGNOSIS: they exist to name the precise reason, and they run first so
    // evaluateMember's historical ordering and reasons are unchanged.
    //
    // This one is the backstop. If the granular set ever disagreed with the
    // resolver, the resolver still wins and the member is refused — which is the
    // safe direction. A test asserts they agree across the lifecycle matrix.
    //
    // Placed LAST deliberately: putting it first would return
    // "campaign_not_live" for a future-dated campaign whose real reason is
    // "not_started", changing reasons the serve path has always given.
    backstop: true,
    reason: "campaign_not_live",
    blocks: ({ facts, now }) =>
      !!facts && computeEffectiveStatus(forStatus(facts), facts.responseCount, now) !== "live",
    copy: "Campaign is not live",
  },
];

/** Operator-facing copy, derived from the list so the two cannot drift. */
export const EXCLUSION_COPY: Record<ExclusionReason, string> =
  Object.fromEntries(PREDICATES.map(p => [p.reason, p.copy])) as Record<ExclusionReason, string>;
