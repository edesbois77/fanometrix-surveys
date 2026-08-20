// ── Studio Campaign Groups: the only place that talks to the database ────────
// Everything above this module (selection, eligibility, revision, attribution)
// is pure. This module does the I/O and hands those modules plain data, so the
// decision logic stays testable without a database.
//
// All writes go through the two SECURITY INVOKER functions from migration 212 —
// fx_campaign_group_edit and fx_campaign_group_cancel_revision — never through
// direct INSERT/UPDATE on the revision tables. Those functions hold the row
// lock, enforce the governance rules and write the complete member snapshot in
// one transaction; reproducing any of that in TypeScript would mean two places
// to keep correct, and the freeze triggers from migration 211 would reject the
// second one anyway.

import { supabaseAdmin } from "@/lib/supabase-admin";
import { campaignStartInstant, campaignEndInstant } from "@/lib/campaign-time";
import { validateSurvey } from "@/lib/survey-validation";
import { OWNER_MODEL, type StudioGroup, type Revision, type RevisionMember, type FailMode } from "./model";
import type { CampaignFacts } from "./eligibility";

const GROUP_COLUMNS =
  "id, group_id, name, organisation_id, owner_model, fail_mode, status, start_date, end_date";

function toGroup(row: Record<string, unknown>): StudioGroup {
  return {
    id: row.id as string,
    slug: row.group_id as string,
    name: row.name as string,
    organisationId: (row.organisation_id as string | null) ?? null,
    ownerModel: OWNER_MODEL.studio,
    failMode: ((row.fail_mode as string | null) ?? "open") as FailMode,
    status: row.status as string,
    startDate: (row.start_date as string | null) ?? null,
    endDate: (row.end_date as string | null) ?? null,
  };
}

/** Resolve a Studio group by its public slug. Returns null for a legacy group. */
export async function loadStudioGroupBySlug(slug: string): Promise<StudioGroup | null> {
  const { data, error } = await supabaseAdmin
    .from("campaign_groups")
    .select(GROUP_COLUMNS)
    .eq("group_id", slug)
    .eq("owner_model", OWNER_MODEL.studio)
    .maybeSingle();
  // See loadRevisions: a read failure must never be reported as "not found".
  if (error) throw new Error(`campaign_groups read failed for slug ${slug}: ${error.message}`);
  return data ? toGroup(data as Record<string, unknown>) : null;
}

export async function loadStudioGroupById(id: string): Promise<StudioGroup | null> {
  const { data, error } = await supabaseAdmin
    .from("campaign_groups")
    .select(GROUP_COLUMNS)
    .eq("id", id)
    .eq("owner_model", OWNER_MODEL.studio)
    .maybeSingle();
  if (error) throw new Error(`campaign_groups read failed for ${id}: ${error.message}`);
  return data ? toGroup(data as Record<string, unknown>) : null;
}

export async function listStudioGroups(organisationId: string): Promise<StudioGroup[]> {
  const { data, error } = await supabaseAdmin
    .from("campaign_groups")
    .select(GROUP_COLUMNS)
    .eq("owner_model", OWNER_MODEL.studio)
    .eq("organisation_id", organisationId)
    .order("name", { ascending: true });
  if (error) throw new Error(`campaign_groups list failed: ${error.message}`);
  return (data ?? []).map(r => toGroup(r as Record<string, unknown>));
}

/**
 * Every revision of a group, newest first, with members.
 *
 * Cancelled revisions ARE returned. They are needed to explain history in
 * Manage and to reject an in-flight session claiming one; the pure resolvers in
 * revision.ts are responsible for never SELECTING a cancelled revision to
 * govern a serve. Filtering them out here would make that impossible to test
 * and would silently turn a cancelled claim into "unknown revision".
 */
export async function loadRevisions(groupId: string): Promise<Revision[]> {
  const { data, error } = await supabaseAdmin
    .from("campaign_group_revisions")
    .select(`
      id, group_id, effective_at, created_at, cancelled_at, rotation, change_kind, change_reason,
      campaign_group_revision_members (
        campaign_id, weight, membership_state,
        campaigns:campaign_id ( campaign_id )
      )
    `)
    .eq("group_id", groupId)
    .order("effective_at", { ascending: false })
    .order("created_at", { ascending: false });

  // A failed query must NOT be reported as "this group has no configuration".
  // Those two states are indistinguishable to every caller above this line, and
  // the second one silently serves nothing — so a typo in a column name would
  // present as a correctly-behaving unconfigured group. Throwing makes the
  // serve path return an error the caller can see instead.
  if (error) {
    throw new Error(`campaign_group_revisions read failed for ${groupId}: ${error.message}`);
  }

  type MemberRow = {
    campaign_id: string;
    weight: number;
    membership_state: string;
    campaigns: { campaign_id: string } | { campaign_id: string }[] | null;
  };

  return (data ?? []).map(r => {
    const row = r as unknown as Record<string, unknown>;
    const rawMembers = (row.campaign_group_revision_members ?? []) as MemberRow[];
    const members: RevisionMember[] = rawMembers.map(m => {
      const joined = Array.isArray(m.campaigns) ? m.campaigns[0] : m.campaigns;
      return {
        campaignId: m.campaign_id,
        campaignSlug: joined?.campaign_id ?? "",
        weight: Number(m.weight),
        membershipState: m.membership_state === "paused" ? "paused" : "active",
      };
    });
    return {
      id: row.id as string,
      groupId: row.group_id as string,
      effectiveAt: new Date(row.effective_at as string),
      createdAt: new Date(row.created_at as string),
      cancelledAt: row.cancelled_at ? new Date(row.cancelled_at as string) : null,
      rotation: (row.rotation as Revision["rotation"]) ?? "equal",
      changeKind: (row.change_kind as string) ?? "",
      reason: (row.change_reason as string | null) ?? null,
      members,
    };
  });
}

/**
 * Server-resolved facts for a set of campaigns.
 *
 * Nothing here is taken from the request. The date instants are computed in the
 * campaign's own market timezone using the same helpers as the single-campaign
 * and legacy-group serves, so a Studio group cannot disagree with them about
 * when a campaign is live.
 */
export async function loadCampaignFacts(campaignUuids: string[]): Promise<Map<string, CampaignFacts>> {
  const out = new Map<string, CampaignFacts>();
  if (campaignUuids.length === 0) return out;

  const [{ data: campaigns, error: campaignsErr }, { data: stats }] = await Promise.all([
    supabaseAdmin
      .from("campaigns")
      .select("id, campaign_id, status, deleted_at, start_date, end_date, country_code, market, publisher_org_id, target_responses, survey_id")
      .in("id", campaignUuids),
    supabaseAdmin.from("vw_campaign_stats").select("campaign_id, response_count"),
  ]);

  // Without this, a failed campaigns read produces an empty fact map, every
  // member is excluded as "campaign_missing", and the group appears to be
  // correctly serving nothing. Fail loudly instead.
  if (campaignsErr) throw new Error(`campaigns read failed: ${campaignsErr.message}`);

  type Row = {
    id: string; campaign_id: string; status: string; deleted_at: string | null;
    start_date: string | null; end_date: string | null;
    country_code: string | null; market: string | null;
    publisher_org_id: string | null; target_responses: number | null; survey_id: string | null;
  };
  const rows = (campaigns ?? []) as Row[];

  const responsesBySlug = new Map<string, number>();
  for (const s of stats ?? []) responsesBySlug.set(s.campaign_id as string, Number(s.response_count ?? 0));

  // Publisher NAMES, resolved from the campaign's configured organisation.
  // organisations is service-role-only, matching the legacy serve path.
  const orgIds = Array.from(new Set(rows.map(r => r.publisher_org_id).filter((v): v is string => !!v)));
  const nameByOrgId = new Map<string, string>();
  if (orgIds.length) {
    const { data: orgs } = await supabaseAdmin.from("organisations").select("id, name").in("id", orgIds);
    for (const o of orgs ?? []) nameByOrgId.set(o.id as string, o.name as string);
  }

  // A Studio campaign always carries its own survey (migration 208 forbids a
  // studio-origin campaign without one), so there is no project-inheritance
  // fallback to resolve here — unlike the legacy path.
  const surveyIds = Array.from(new Set(rows.map(r => r.survey_id).filter((v): v is string => !!v)));
  const surveyValidById = new Map<string, boolean>();
  if (surveyIds.length) {
    const { data: surveys } = await supabaseAdmin
      .from("surveys").select("id, name, questions").in("id", surveyIds);
    for (const s of surveys ?? []) {
      const questions = (s.questions ?? []) as unknown[];
      const valid = questions.length > 0 &&
        validateSurvey(s as Parameters<typeof validateSurvey>[0]).length === 0;
      surveyValidById.set(s.id as string, valid);
    }
  }

  for (const r of rows) {
    out.set(r.id, {
      id: r.id,
      slug: r.campaign_id,
      status: r.status,
      deletedAt: r.deleted_at,
      startsAt: r.start_date ? campaignStartInstant(r.start_date, r.country_code) : null,
      endsAt:   r.end_date   ? campaignEndInstant(r.end_date, r.country_code)     : null,
      countryCode: r.country_code,
      market: r.market,
      publisherName: r.publisher_org_id ? nameByOrgId.get(r.publisher_org_id) ?? null : null,
      publisherOrgId: r.publisher_org_id,
      targetResponses: r.target_responses,
      responseCount: responsesBySlug.get(r.campaign_id) ?? 0,
      surveyId: r.survey_id,
      surveyValid: r.survey_id ? surveyValidById.get(r.survey_id) ?? false : false,
    });
  }
  return out;
}

// ── Writes ──────────────────────────────────────────────────────────────────

export interface EditMemberInput {
  campaign_id: string;
  weight: number;
  membership_state?: "active" | "paused";
}

export interface EditResult {
  ok: boolean;
  revisionId?: string;
  /** The database's own message. It is written for an operator, so it is safe
   *  and useful to surface verbatim rather than replacing it with a generic
   *  failure the operator cannot act on. */
  error?: string;
}

export async function editGroup(input: {
  groupId: string;
  effectiveAt: Date;
  rotation: "equal" | "weighted" | "priority";
  members: EditMemberInput[];
  changeKind: string;
  reason: string | null;
  actor: string;
  activeCampaignLimit?: number;
  comparabilityAcknowledged?: boolean;
}): Promise<EditResult> {
  const { data, error } = await supabaseAdmin.rpc("fx_campaign_group_edit", {
    p_group_id: input.groupId,
    p_effective_at: input.effectiveAt.toISOString(),
    p_rotation: input.rotation,
    p_members: input.members,
    p_change_kind: input.changeKind,
    p_reason: input.reason,
    p_actor: input.actor,
    ...(input.activeCampaignLimit !== undefined ? { p_active_limit: input.activeCampaignLimit } : {}),
    ...(input.comparabilityAcknowledged !== undefined ? { p_comparability_ack: input.comparabilityAcknowledged } : {}),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, revisionId: data as string };
}

export async function cancelRevision(revisionId: string, actor: string): Promise<EditResult> {
  const { error } = await supabaseAdmin.rpc("fx_campaign_group_cancel_revision", {
    p_revision_id: revisionId,
    p_actor: actor,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
