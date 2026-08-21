// ── Studio Campaign Groups: the shared vocabulary ────────────────────────────
// WP1 introduces a SECOND owner model alongside the legacy project-scoped
// Campaign Group. The two never mix:
//
//   owner_model = 'research_project'  legacy. Membership lives in
//                                     campaign_group_members, mutated in place,
//                                     with no history. Served by
//                                     /api/embed/group. UNCHANGED by WP1.
//   owner_model = 'survey_studio'     Studio. Membership exists only inside a
//                                     configuration REVISION, which freezes the
//                                     moment it becomes effective. Served by
//                                     /api/embed/studio-group.
//
// Every read of campaign_groups added or touched by WP1 filters on owner_model
// so a Studio group can never be returned to a legacy code path, nor a legacy
// group to a Studio one. See migration 209.

export const OWNER_MODEL = {
  legacy: "research_project",
  studio: "survey_studio",
} as const;

export type OwnerModel = (typeof OWNER_MODEL)[keyof typeof OWNER_MODEL];

/** Campaign provenance (migration 208). Studio campaigns must carry a survey. */
export const CAMPAIGN_ORIGIN = {
  legacy: "legacy",
  studio: "survey_studio",
} as const;

export type CampaignOrigin = (typeof CAMPAIGN_ORIGIN)[keyof typeof CAMPAIGN_ORIGIN];

/**
 * What a group does when NO member is eligible.
 *
 *   'open'   serve nothing, return 404, and let the publisher's own fallback
 *            fill the slot. This is what the legacy path already does, and is
 *            the default for every existing row (migration 209).
 *   'closed' the group is a governed instrument: refuse to serve rather than
 *            risk an unattributed impression.
 *
 * fail_mode is a property of the GROUP, not of a revision, because it describes
 * how the publisher integration should behave, not what was configured.
 */
export const FAIL_MODE = { open: "open", closed: "closed" } as const;
export type FailMode = (typeof FAIL_MODE)[keyof typeof FAIL_MODE];

/** Lifecycle of one configuration revision, derived from timestamps only. */
export type RevisionState = "pending" | "effective" | "cancelled" | "superseded";

export type MembershipState = "active" | "paused";

export interface RevisionMember {
  campaignId: string;          // campaigns.id (uuid)
  campaignSlug: string;        // campaigns.campaign_id — the human/ad-ops handle
  weight: number;              // schema guarantees > 0
  membershipState: MembershipState;
}

export interface Revision {
  id: string;
  groupId: string;
  effectiveAt: Date;
  createdAt: Date;
  cancelledAt: Date | null;
  rotation: "equal" | "weighted" | "priority";
  changeKind: string;
  reason: string | null;
  members: RevisionMember[];
}

export interface StudioGroup {
  id: string;
  slug: string;                // campaign_groups.group_id
  name: string;
  organisationId: string | null;
  ownerModel: OwnerModel;
  failMode: FailMode;
  status: string;
  startDate: string | null;
  endDate: string | null;
}

/**
 * Resolve a revision's state at `now`.
 *
 * `superseded` is deliberately NOT derivable from a single revision — it needs
 * the sibling set — so it is computed by the resolver, not here.
 */
export function revisionState(rev: Pick<Revision, "effectiveAt" | "cancelledAt">, now: Date): Exclude<RevisionState, "superseded"> {
  if (rev.cancelledAt) return "cancelled";
  return rev.effectiveAt.getTime() <= now.getTime() ? "effective" : "pending";
}

/** Only members in 'active' state are candidates for a serve. */
export function activeMembers(rev: Revision): RevisionMember[] {
  return rev.members.filter(m => m.membershipState === "active");
}
