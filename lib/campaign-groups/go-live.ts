// -- Whether a group may be set live, decided by the SERVER -------------------
//
// A valid effective configuration is NOT sufficient. A group whose members are
// all undeployed drafts would go live and return empty inventory indefinitely,
// which looks to a publisher like a broken tag rather than a deliberate state.
//
// Three outcomes:
//
//   serving    at least one member can serve right now
//   scheduled  none can serve now, but at least one WILL, deterministically, at
//              a defined instant. Allowed with a confirmation naming it.
//   blocked    neither. Nothing will change without a human acting, so going
//              live would promise delivery that never arrives.
//
// "DETERMINISTICALLY SERVEABLE" is deliberately narrow, and means all three of:
//   1. the campaign is LIVE (deployed - Deploy is the activation gate)
//   2. its start instant is in the future
//   3. evaluating it AT that instant returns eligible
//
// (3) is what stops us promising a serving time that never arrives - a campaign
// scheduled to start after its own end date, or already at its target, would
// otherwise qualify on (1) and (2) alone.
//
// A DRAFT with a future start date does NOT qualify. The date is configured but
// Deploy has not happened, and nothing will change its status on its own. That
// is the case most likely to mislead someone, so it carries its own wording.

import { evaluateMember, assessServeReadiness, type CampaignFacts, type RoutingContext } from "./eligibility";
import type { Revision, RevisionMember } from "./model";
import { activeMembers } from "./model";
import { nextPendingRevision } from "./revision";

/** No routing context applies to a Set Live decision: it asks "could this serve
 *  at all", not "would it serve to one particular caller". */
const NO_ROUTING: RoutingContext = { country: null, market: null, publisher: null };

export interface GoLiveBlocker {
  campaign: string;
  reasons: string[];
  /** Set when a configured future start date will NOT take effect on its own. */
  note?: string;
}

export interface GoLiveVerdict {
  allowed: boolean;
  mode: "serving" | "scheduled" | "blocked";
  scheduled_at?: string;
  scheduled_campaign?: string;
  blockers?: GoLiveBlocker[];
}

/** The instant a member becomes serveable, or null if never without a human. */
export function deterministicServeAt(
  member: RevisionMember,
  facts: CampaignFacts | undefined,
  now: Date,
): Date | null {
  if (!facts) return null;

  // DEPLOYED means past the Deploy gate: stored "live" OR "scheduled". Deploy
  // stores "scheduled" for any campaign with a future start date, so requiring
  // "live" here made this whole branch unreachable in practice.
  //
  // A DRAFT never qualifies however its dates are set: a configured date does not
  // deploy a campaign, and nothing will change its status on its own.
  if (facts.status !== "live" && facts.status !== "scheduled") return null;

  if (!facts.startsAt) return null;                      // deployed, no start = serves now, not later
  if (facts.startsAt.getTime() <= now.getTime()) return null;

  // Would it actually be eligible when it arrives? evaluateMember consumes the
  // same authoritative effective-status resolver, so the instant promised here
  // is exactly the instant the serve path starts accepting the member. That
  // equivalence is asserted by test.
  const atStart = evaluateMember(member, facts, NO_ROUTING, facts.startsAt);
  return atStart.eligible ? facts.startsAt : null;
}

export function assessGoLive(
  revision: Revision | null,
  factsById: Map<string, CampaignFacts>,
  now: Date,
): GoLiveVerdict {
  if (!revision) {
    return { allowed: false, mode: "blocked", blockers: [] };
  }

  const members = activeMembers(revision);
  if (members.length === 0) {
    return { allowed: false, mode: "blocked", blockers: [] };
  }

  // 1. Anything serving right now?
  for (const m of members) {
    if (evaluateMember(m, factsById.get(m.campaignId), NO_ROUTING, now).eligible) {
      return { allowed: true, mode: "serving" };
    }
  }

  // 2. Anything deterministically becoming serveable? Earliest wins.
  let soonest: { at: Date; campaign: string } | null = null;
  for (const m of members) {
    const at = deterministicServeAt(m, factsById.get(m.campaignId), now);
    if (at && (!soonest || at.getTime() < soonest.at.getTime())) {
      soonest = { at, campaign: m.campaignSlug };
    }
  }
  if (soonest) {
    return {
      allowed: true,
      mode: "scheduled",
      scheduled_at: soonest.at.toISOString(),
      scheduled_campaign: soonest.campaign,
    };
  }

  // 3. Blocked. Say exactly what must change, for every member.
  const blockers: GoLiveBlocker[] = members.map(m => {
    const facts = factsById.get(m.campaignId);
    const { copy } = assessServeReadiness(m, facts, NO_ROUTING, now);
    const draftWithFutureStart =
      !!facts && facts.status !== "live" && !!facts.startsAt &&
      facts.startsAt.getTime() > now.getTime();
    return {
      campaign: m.campaignSlug,
      reasons: copy,
      ...(draftWithFutureStart
        ? { note: "This campaign has a future start date but is still a draft. Deploy it before it can become eligible." }
        : {}),
    };
  });

  return { allowed: false, mode: "blocked", blockers };
}

/**
 * When this verdict stops being true, so the client can refetch instead of
 * inferring. The client is not permitted to reason about eligibility, and that
 * necessarily includes reasoning about when eligibility expires.
 *
 * The earliest of: the next pending revision taking effect, and the next member
 * start or end instant. Null when nothing is scheduled to change.
 */
export function nextStateChangeAt(
  revisions: Revision[],
  effective: Revision | null,
  factsById: Map<string, CampaignFacts>,
  now: Date,
): string | null {
  const candidates: number[] = [];

  const next = nextPendingRevision(revisions, now);
  if (next) candidates.push(next.effectiveAt.getTime());

  for (const m of effective ? activeMembers(effective) : []) {
    const f = factsById.get(m.campaignId);
    if (f?.startsAt && f.startsAt.getTime() > now.getTime()) candidates.push(f.startsAt.getTime());
    if (f?.endsAt   && f.endsAt.getTime()   > now.getTime()) candidates.push(f.endsAt.getTime());
  }

  if (candidates.length === 0) return null;
  return new Date(Math.min(...candidates)).toISOString();
}
