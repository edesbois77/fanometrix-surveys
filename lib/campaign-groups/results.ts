// -- Reading a Studio Campaign Group's results by campaign x configuration ----
//
// The question this answers is "what did each campaign collect, under which
// configuration" - which is the whole reason configuration_revision_id exists.
//
// Two honesty constraints shape the output:
//
//   - Evidence collected BEFORE WP1 shipped carries no revision. It is reported
//     under an explicit "unattributed" bucket rather than folded into the
//     earliest revision, because assigning it to a configuration that may not
//     have governed it would be a fabrication. A group created after WP1 will
//     simply have an empty bucket.
//   - A revision-attributed count means the revision was ELIGIBLE to govern the
//     serve, not that this respondent was demonstrably handed it. WP1 keeps no
//     assignment ledger. Callers rendering these numbers must not describe them
//     as proof of delivery.

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Revision } from "./model";

export const UNATTRIBUTED = "unattributed" as const;

export interface CampaignRevisionCell {
  campaignSlug: string;
  /** A revision id, or UNATTRIBUTED for evidence that predates the group's
   *  configuration provenance. */
  revisionId: string;
  /** Distinct sessions that gave at least one answer. */
  respondents: number;
  /** Individual answers - the authoritative evidence unit. */
  answers: number;
}

export interface GroupResults {
  cells: CampaignRevisionCell[];
  totalAnswers: number;
  totalRespondents: number;
  /** True when any evidence for this group carries no configuration. Callers
   *  should surface this rather than silently presenting a partial breakdown. */
  hasUnattributed: boolean;
}

/**
 * Results for one group, from response_answers.
 *
 * response_answers is the authoritative per-answer store, so it is the source
 * here rather than `responses`: a respondent who answered two questions and
 * abandoned still contributed evidence, and a completion-only count would
 * discard it.
 */
export async function loadGroupResults(
  campaignSlugs: string[],
  revisions: Revision[],
): Promise<GroupResults> {
  const empty: GroupResults = { cells: [], totalAnswers: 0, totalRespondents: 0, hasUnattributed: false };
  if (campaignSlugs.length === 0) return empty;

  const { data, error } = await supabaseAdmin
    .from("response_answers")
    .select("campaign_id, session_id, configuration_revision_id")
    .in("campaign_id", campaignSlugs);

  // A failed read must not be presented as "no results" - that reads as a group
  // that collected nothing, which is a very different finding.
  if (error) throw new Error(`response_answers read failed: ${error.message}`);

  const known = new Set(revisions.map(r => r.id));
  const byCell = new Map<string, { answers: number; sessions: Set<string> }>();
  const allSessions = new Set<string>();
  let hasUnattributed = false;

  for (const row of data ?? []) {
    const slug = row.campaign_id as string;
    const claimed = (row.configuration_revision_id as string | null) ?? null;
    // A revision id that does not belong to THIS group is treated as
    // unattributed rather than reported as an unknown value: the row is real
    // evidence, but its provenance is not something this group can vouch for.
    const revisionId = claimed && known.has(claimed) ? claimed : UNATTRIBUTED;
    if (revisionId === UNATTRIBUTED) hasUnattributed = true;

    const key = `${slug}|${revisionId}`;
    let cell = byCell.get(key);
    if (!cell) { cell = { answers: 0, sessions: new Set() }; byCell.set(key, cell); }
    cell.answers += 1;
    const session = row.session_id as string | null;
    if (session) { cell.sessions.add(session); allSessions.add(session); }
  }

  const cells: CampaignRevisionCell[] = [...byCell.entries()].map(([key, v]) => {
    const sep = key.lastIndexOf("|");
    return {
      campaignSlug: key.slice(0, sep),
      revisionId: key.slice(sep + 1),
      respondents: v.sessions.size,
      answers: v.answers,
    };
  });

  // Newest configuration first, then campaign, so the current picture leads.
  const LAST = Number.MAX_SAFE_INTEGER;
  const orderOf = new Map(revisions.map((r, i) => [r.id, i]));
  cells.sort((a, b) => {
    const ao = a.revisionId === UNATTRIBUTED ? LAST : orderOf.get(a.revisionId) ?? LAST - 1;
    const bo = b.revisionId === UNATTRIBUTED ? LAST : orderOf.get(b.revisionId) ?? LAST - 1;
    return ao !== bo ? ao - bo : a.campaignSlug.localeCompare(b.campaignSlug);
  });

  return {
    cells,
    totalAnswers: cells.reduce((s, c) => s + c.answers, 0),
    // Distinct across the whole group - summing per-cell respondents would
    // double-count anyone whose session spans a configuration boundary.
    totalRespondents: allSessions.size,
    hasUnattributed,
  };
}
