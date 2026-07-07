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
import type { AuthedUser } from "@/lib/auth-server";

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
  if (user.role === "admin") return null;

  if (user.accessScope === "organisation_wide") {
    if (!user.organisationId) return [];
    return orgWideResourceIds(user.organisationId, resourceType);
  }

  return selectedResourceIds(user.id, resourceType);
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
      // physically running on their platform, so it stays visible
      // (read-only, labelled "Set up by Fanometrix" in the UI — enforced
      // in app/api/campaigns/[id]/route.ts's PUT/DELETE handlers).
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
      const { data } = await supabaseAdmin
        .from("campaign_groups")
        .select("id")
        .or(`publisher_org_id.eq.${organisationId},brand_org_id.eq.${organisationId},agency_org_id.eq.${organisationId}`)
        .eq("created_by_admin", false);
      return (data ?? []).map(r => r.id as string);
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

async function selectedResourceIds(userId: string, resourceType: ResourceType): Promise<string[]> {
  const { data: grantRows } = await supabaseAdmin
    .from("user_access_grants")
    .select("resource_type, resource_id")
    .eq("user_id", userId);

  const rows = grantRows ?? [];
  const idsOf = (t: ResourceType) => rows.filter(g => g.resource_type === t).map(g => g.resource_id as string);

  if (resourceType === "research_project" || resourceType === "insight") {
    return idsOf(resourceType);
  }

  if (resourceType === "campaign_group") {
    // campaign_groups have no research_project_id of their own (a group's
    // relationship to a project is indirect, via its member campaigns),
    // so a research_project grant doesn't currently cascade down to
    // groups — only a direct campaign_group grant does.
    return idsOf("campaign_group");
  }

  // resourceType === "campaign": inherits from a grant on the campaign
  // itself, its campaign group, or its research project.
  const direct = idsOf("campaign");
  const groupIds = idsOf("campaign_group");
  const projectIds = idsOf("research_project");
  const ids = new Set<string>(direct);

  if (projectIds.length > 0) {
    const { data } = await supabaseAdmin.from("campaigns").select("id").in("research_project_id", projectIds);
    (data ?? []).forEach(r => ids.add(r.id as string));
  }
  if (groupIds.length > 0) {
    const { data } = await supabaseAdmin.from("campaign_group_members").select("campaign_id").in("group_id", groupIds);
    (data ?? []).forEach(r => ids.add(r.campaign_id as string));
  }
  return Array.from(ids);
}
