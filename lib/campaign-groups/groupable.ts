// -- GROUPABLE is not SERVE-ELIGIBLE -----------------------------------------
//
// These are different questions and conflating them breaks the product:
//
//   groupable       may this campaign be PUT IN a configuration?
//                   Structural: it exists, it is a Studio campaign, the caller
//                   may operate it. A DRAFT is groupable - grouping happens in
//                   the Campaigns stage, BEFORE Deploy, so requiring live
//                   campaigns would invert the intended journey.
//
//   serve-eligible  will it RECEIVE DELIVERY right now?
//                   Operational, and lives in predicates.ts.
//
// The rule below was previously inline in POST /api/studio/campaign-groups/[id]/revisions.
// The candidate endpoint has to apply exactly the same rule, and copying it
// would have produced the one kind of drift that is hardest to notice: a picker
// that offers a campaign the publish call then refuses, or vice versa.

import { CAMPAIGN_ORIGIN } from "./model";

export type GroupableRefusal =
  | "not_found"
  | "not_studio_campaign"
  | "not_authorised";

/** What the caller must know about a candidate to judge it. Deliberately small:
 *  nothing here is operational. */
export interface GroupableFacts {
  id: string;
  slug: string;
  origin: string;
  deletedAt: string | null;
  /** organisation_id of the OWNING SURVEY, not the campaign. */
  surveyOrganisationId: string | null;
}

export interface GroupableDecision {
  canAdd: boolean;
  refusal: GroupableRefusal | null;
  /** Operator-facing. Null when it can be added. */
  reason: string | null;
}

/**
 * Authority to group follows authority to OPERATE the campaign - the same
 * authority that governs deploying it in the very same stage. Seeing a campaign
 * in a list is not permission to change how it is delivered.
 *
 * An admin may group any Studio campaign. Everyone else may group campaigns
 * belonging to a survey their Active Organisation owns. A survey with no
 * organisation has nothing to check against, so it stays admin-only.
 *
 * `not_authorised` deliberately reports as "not found": a caller must not learn
 * that a campaign exists in another organisation by probing ids.
 */
export function assessGroupable(
  facts: GroupableFacts | undefined,
  session: { role: string; organisationId: string | null },
): GroupableDecision {
  const no = (refusal: GroupableRefusal, reason: string): GroupableDecision =>
    ({ canAdd: false, refusal, reason });

  if (!facts || facts.deletedAt) {
    return no("not_found", "This campaign no longer exists.");
  }
  if (facts.origin !== CAMPAIGN_ORIGIN.studio) {
    return no("not_studio_campaign", "Only Survey Studio campaigns can be grouped.");
  }
  if (session.role !== "admin" && facts.surveyOrganisationId !== session.organisationId) {
    // Same wording as not-found, on purpose. See above.
    return no("not_authorised", "This campaign no longer exists.");
  }
  return { canAdd: true, refusal: null, reason: null };
}

/** The publish route's message for a rejected set, unchanged in shape from the
 *  wording it used inline. */
export function groupableRefusalSummary(
  problems: Array<{ slug: string; reason: string }>,
): string {
  return `These campaigns cannot be added: ${problems.map(p => `${p.slug} (${p.reason})`).join(", ")}.`;
}
