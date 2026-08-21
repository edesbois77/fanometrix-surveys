// Node-only. The single reusable resource-level authorization surface —
// "given an already-authenticated user (see lib/auth-server.ts), which
// Research Projects / Campaign Groups / Campaigns / Insights can they
// see?" Role checks and organisation/account status live in
// requireUser(); this module only answers the finer-grained
// organisation-wide-vs-selected-access question, with grants inheriting
// downward: Research Project → Campaign Group → Campaign, and Insight as
// its own flat level (it doesn't hang off the other three).
//
// No permission-template concept — effective access is always the direct
// combination of role + access scope + user_access_grants rows.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { OWNER_MODEL } from "@/lib/campaign-groups/model";
import type { AuthedUser } from "@/lib/auth-server";
import { operatorVisibleResourceIds, operatorVisibleDataCampaignIds } from "@/lib/authz/operator-access";

export type ResourceType = "research_project" | "campaign_group" | "campaign" | "insight";

/**
 * Returns the ids of the given resource type that `user` can see, or
 * `null` if the caller shouldn't filter at all (admins see everything).
 * An empty array unambiguously means "this user can see none of these" —
 * unlike the old allowed_campaign_ids/allowed_publisher_ids scheme this
 * replaces, there is no "empty means everything" ambiguity anywhere here.
 */
export async function visibleResourceIds(
  user: AuthedUser,
  resourceType: ResourceType
): Promise<string[] | null> {
  // ORG-005 G-2 (ACTIVE): platform operators (admins) are governed by the
  // Platform-Operator standing entitlement, NOT by an unconditional role bypass.
  // An entitled domain yields unrestricted visibility (routine operation); otherwise
  // Default Refuse + bounded Exceptional Access. Revocable + DENY-subordinate.
  if (user.role === "admin") return operatorVisibleResourceIds(user, resourceType);

  // ORG-005 G-3 (ACTIVE): the Study decision is authoritative via Organisation
  // Resource Entitlement (Q-14/Q-15). Study ORE was backfilled to mirror the
  // prior org-wide visibility exactly (0 divergence). campaign / campaign_group /
  // insight remain OPERATIONAL visibility on the legacy path (§9-E) — they are not
  // governed resource classes and their monitoring visibility is unchanged.
  if (resourceType === "research_project") {
    return authoritativeStudyIds(user);
  }

  if (user.accessScope === "organisation_wide") {
    if (!user.organisationId) return [];
    return orgWideResourceIds(user.organisationId, resourceType);
  }

  return selectedResourceIds(user.id, resourceType);
}

/**
 * ORG-005 G-3 — the authoritative Study visible set for a non-admin principal:
 * Organisation Resource Entitlement (study class) narrowed by User Resource
 * Authorisation (never expands). Direct-id study entitlements only (no scopes at
 * baseline). Mirrors the accepted pure resolver's narrowing semantics.
 */
async function authoritativeStudyIds(user: AuthedUser): Promise<string[]> {
  if (!user.organisationId) return [];
  const [{ data: ore }, { data: ura }] = await Promise.all([
    supabaseAdmin.from("organisation_resource_entitlements")
      .select("resource_id").eq("organisation_id", user.organisationId)
      .eq("resource_class", "study").eq("status", "active").not("resource_id", "is", null),
    supabaseAdmin.from("user_resource_authorisations")
      .select("resource_id, effect").eq("user_id", user.id)
      .eq("resource_class", "study").eq("status", "active"),
  ]);
  const restrict = new Set((ura ?? []).filter(u => u.effect === "restrict").map(u => u.resource_id));
  const allow = new Set((ura ?? []).filter(u => u.effect === "allow").map(u => u.resource_id));
  let ids = (ore ?? []).map(r => r.resource_id as string).filter(id => !restrict.has(id));
  if (user.accessScope === "selected") ids = ids.filter(id => allow.has(id)); // selected: explicit URA only
  return ids;
}

/**
 * ORG-005 G-3 — the authoritative campaign set whose response DATA a non-admin
 * principal may read, per the approved per-participant Data Resource Scopes
 * (Data is per-Campaign; a scope holds only the org's OWN campaigns within Studies
 * it participates in). Returns campaign UUIDs (same shape as the legacy campaign
 * gate); `null` = admin (super-ALLOW). This REPLACES campaign-visibility gating on
 * the Data-egress routes: it preserves publisher isolation, prohibits
 * cross-publisher Data, and yields exactly the 11 accepted governed tightenings.
 */
export async function dataVisibleCampaignIds(user: AuthedUser): Promise<string[] | null> {
  // ORG-005 G-2 (ACTIVE): operator Data access via the standing entitlement, not role.
  if (user.role === "admin") return operatorVisibleDataCampaignIds(user);
  if (!user.organisationId) return [];
  const campaignIds = new Set<string>(await orgDataCampaignIds(user.organisationId)); // org-level entitlement
  const { data: ura } = await supabaseAdmin.from("user_resource_authorisations")
    .select("resource_id, effect").eq("user_id", user.id)
    .eq("resource_class", "data").eq("status", "active");
  (ura ?? []).filter(u => u.effect === "restrict").forEach(u => campaignIds.delete(u.resource_id as string)); // narrows within the org
  return [...campaignIds];
}

/**
 * The ORGANISATION-level governed Data universe: the org's active Data-class ORE
 * campaigns (direct + scope members), BEFORE any per-user URA narrowing. This is the
 * SAME governed authority (`organisation_resource_entitlements`, class `data`) that
 * `dataVisibleCampaignIds` reads — factored out so an owning organisation's eligible
 * survey universe can be resolved when a platform operator edits that org's Study.
 * It is NOT a second entitlement path and NEVER grants access on its own. `[]` = none.
 */
export async function orgDataCampaignIds(organisationId: string): Promise<string[]> {
  if (!organisationId) return [];
  const { data: ore } = await supabaseAdmin.from("organisation_resource_entitlements")
    .select("resource_id, scope_id").eq("organisation_id", organisationId)
    .eq("resource_class", "data").eq("status", "active");
  const campaignIds = new Set<string>((ore ?? []).map(r => r.resource_id).filter(Boolean) as string[]); // direct (none at baseline)
  const scopeIds = (ore ?? []).map(r => r.scope_id).filter(Boolean) as string[];
  if (scopeIds.length) {
    const { data: members } = await supabaseAdmin.from("resource_scope_members")
      .select("resource_id").eq("resource_class", "data").in("scope_id", scopeIds);
    (members ?? []).forEach(m => campaignIds.add(m.resource_id as string));
  }
  return [...campaignIds];
}

/** Single-resource check, for detail-fetch routes. */
export async function canAccess(
  user: AuthedUser,
  resourceType: ResourceType,
  resourceId: string
): Promise<boolean> {
  const ids = await visibleResourceIds(user, resourceType);
  return ids === null || ids.includes(resourceId);
}

async function orgWideResourceIds(organisationId: string, resourceType: ResourceType): Promise<string[]> {
  switch (resourceType) {
    case "campaign": {
      // Deliberately not filtered by created_by_admin — a campaign an
      // admin sets up that targets this organisation is still something
      // physically running on their platform, so it stays visible for
      // monitoring, labelled "Set up by Fanometrix" in the UI, fully
      // read-only (no edit, delete, or status actions) — enforced in
      // app/api/campaigns/[id]/route.ts and .../actions/route.ts.
      const { data } = await supabaseAdmin
        .from("campaigns")
        .select("id")
        .or(`publisher_org_id.eq.${organisationId},brand_org_id.eq.${organisationId},agency_org_id.eq.${organisationId}`)
        .is("deleted_at", null);
      return (data ?? []).map(r => r.id as string);
    }
    case "campaign_group": {
      // Admin-created groups are never org-wide visible, regardless of
      // targeting — they're an authoring tool, not something a publisher
      // needs to see (unlike Campaigns, which stay visible read-only —
      // see the "campaign" case above and supabase-migration-064.sql).
      const [{ data: direct }, projectIds] = await Promise.all([
        supabaseAdmin
          .from("campaign_groups")
          .select("id")
          .or(`publisher_org_id.eq.${organisationId},brand_org_id.eq.${organisationId},agency_org_id.eq.${organisationId}`)
          .eq("created_by_admin", false)
          .eq("owner_model", OWNER_MODEL.legacy),
        orgWideResourceIds(organisationId, "research_project"),
      ]);
      const ids = new Set<string>((direct ?? []).map(r => r.id as string));

      // Additive (migration 096): a group scoped to a Research Project this
      // organisation can already see is visible too, even if the group's
      // own publisher/brand/agency org fields don't happen to match — the
      // project relationship is now a visibility path in its own right,
      // not just the group's own org targeting.
      if (projectIds.length > 0) {
        const { data: byProject } = await supabaseAdmin
          .from("campaign_groups")
          .select("id")
          .eq("owner_model", OWNER_MODEL.legacy)
          .in("research_project_id", projectIds);
        (byProject ?? []).forEach(r => ids.add(r.id as string));
      }
      return Array.from(ids);
    }
    case "research_project": {
      // Admin-created projects are never org-wide visible, regardless of
      // targeting — same reasoning as campaign_group above.
      const [byOwner, byPublisher] = await Promise.all([
        supabaseAdmin.from("research_projects").select("id")
          .or(`brand_org_id.eq.${organisationId},agency_org_id.eq.${organisationId}`)
          .eq("created_by_admin", false)
          .is("deleted_at", null),
        supabaseAdmin.from("research_projects").select("id")
          .contains("publisher_org_ids", [organisationId])
          .eq("created_by_admin", false)
          .is("deleted_at", null),
      ]);
      const ids = new Set<string>();
      (byOwner.data ?? []).forEach(r => ids.add(r.id as string));
      (byPublisher.data ?? []).forEach(r => ids.add(r.id as string));
      return Array.from(ids);
    }
    case "insight": {
      // Insights carry free-text audience tags, not organisation FKs —
      // org-wide visibility for insights is resolved by the existing
      // lib/insights-access.ts tag matching, not this module, until
      // insights are brought into the organisation model in a later
      // phase. Selected Access grants (below) already work for insights
      // today via user_access_grants.
      return [];
    }
  }
}

// ORG-005 IW-11 / DEC-1 Option A — Selected Access is RESTRICTED TO STUDIES and
// migrated to the governed model. Study Selected Access is served through the
// governed Study User Resource Authorisation (via `authoritativeStudyIds`, which
// `visibleResourceIds` uses for "research_project"). Per-user Selected Access for
// campaign / campaign_group / insight is RETIRED (campaign/group remain §9-E
// operational visibility; insight is governed by its organisation-ID association).
// This function is therefore no longer a `user_access_grants` reader — the legacy
// table has no remaining read consumer.
async function selectedResourceIds(_userId: string, _resourceType: ResourceType): Promise<string[]> {
  return [];
}
