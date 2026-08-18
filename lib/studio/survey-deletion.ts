// ── Survey-deletion safety decision ──────────────────────────────────────────
// Pure, DB-free rules that decide whether a survey may be soft-deleted and, if so,
// which of its attached campaign rows may be soft-deleted alongside it.
//
// A survey is BLOCKED from deletion when it has either:
//   • a genuinely LIVE campaign (status === "live"), or
//   • any COLLECTED EVIDENCE — survey events, responses, or response answers —
//     on any of its campaigns, or responses attributed directly to the survey.
//
// It is NOT blocked merely because campaign rows exist. A draft survey whose only
// associations are non-live, zero-evidence campaigns (Studio-native OR legacy) is
// deletable, and those empty campaign rows are cleared as part of the same flow.
//
// This module never references Research Projects: soft-deleting a campaign row only
// touches the campaign, so an RP-linked campaign's RP is left completely untouched.

export const LIVE_STATUS = "live";

/** A minimal campaign row — only the fields the safety rules read. */
export type CampaignRow = {
  /** campaigns.id (row primary key) — the unit we soft-delete. */
  id: string;
  /** campaigns.campaign_id (analytics slug) — Studio-native slugs start "studio_". */
  campaign_id: string | null;
  /** campaigns.status — "draft" | "live" | "closed" | … */
  status: string | null;
};

/** Collected-evidence counts for a single campaign (all zero ⇒ no evidence). */
export type CampaignEvidence = { events: number; responses: number; answers: number };

export type SurveyDeletionInput = {
  campaigns: CampaignRow[];
  /** Evidence keyed by campaign row id (campaigns.id). Absent ⇒ treated as zero. */
  evidenceByCampaignId: Record<string, CampaignEvidence | undefined>;
  /** Responses attributed directly to survey_id (vw_survey_stats.response_count). */
  surveyResponseCount: number;
};

export type BlockedReason = "live_campaign" | "collected_evidence";

export type SurveyDeletionDecision =
  | { deletable: false; reason: BlockedReason; message: string }
  | { deletable: true; campaignIdsToSoftDelete: string[] };

/** True when a campaign carries any collected evidence at all. */
export function campaignHasEvidence(e: CampaignEvidence | undefined): boolean {
  if (!e) return false;
  return (e.events ?? 0) > 0 || (e.responses ?? 0) > 0 || (e.answers ?? 0) > 0;
}

/** True when a campaign is genuinely live. */
export function campaignIsLive(c: CampaignRow): boolean {
  return c.status === LIVE_STATUS;
}

/**
 * A campaign is safe to soft-delete only when it is BOTH non-live AND carries no
 * evidence. Used both to decide the delete set and — critically — to re-verify each
 * candidate immediately before mutation (fail-closed recheck).
 */
export function campaignIsSafeToSoftDelete(
  c: CampaignRow,
  evidence: CampaignEvidence | undefined,
): boolean {
  return !campaignIsLive(c) && !campaignHasEvidence(evidence);
}

export function decideSurveyDeletion(input: SurveyDeletionInput): SurveyDeletionDecision {
  const { campaigns, evidenceByCampaignId, surveyResponseCount } = input;

  // Block: any genuinely live campaign. The user must stop it first — and can,
  // because a live campaign is by definition visible and manageable.
  if (campaigns.some(campaignIsLive)) {
    return {
      deletable: false,
      reason: "live_campaign",
      message:
        "This survey has a live campaign. Stop the campaign before deleting the survey.",
    };
  }

  // Block: any collected evidence — on a campaign or attributed to the survey.
  const anyCampaignEvidence = campaigns.some((c) =>
    campaignHasEvidence(evidenceByCampaignId[c.id]),
  );
  if (anyCampaignEvidence || (surveyResponseCount ?? 0) > 0) {
    return {
      deletable: false,
      reason: "collected_evidence",
      message: "This survey has collected response data and can't be deleted.",
    };
  }

  // Deletable: every attached campaign is non-live and evidence-free, so all may be
  // soft-deleted with the survey (Studio-native and legacy rows alike).
  return {
    deletable: true,
    campaignIdsToSoftDelete: campaigns.map((c) => c.id),
  };
}
