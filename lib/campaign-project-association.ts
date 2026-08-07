// Authoritative server-side guard for associating a Campaign with a Research
// Project (F040). Attaching a campaign to a project makes the project→campaign
// visibility cascade in lib/access.ts expose that campaign — and its
// responses — to everyone who can see the project. Nothing else enforces that
// the campaign actually belongs on that project, so this guard must:
//   1. reject a project the actor is not authorised to associate with, and
//   2. reject a campaign whose organisation is not one of the project's
//      organisations (which would make the cascade leak across organisations),
//   3. fail closed on a missing / deleted / unknown project reference.
// Admins bypass (1) — they are authorised platform-wide — but NOT (2): an
// admin still cannot create a cross-organisation association, so the cascade
// can never expose an org-inconsistent campaign regardless of who wrote it.
//
// This does NOT implement the future ORG-005 Resource Entitlement model; it is
// the minimum invariant that keeps the existing cascade org-safe.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { canAccess } from "@/lib/access";
import type { AuthedUser } from "@/lib/auth-server";
import type { UserRole } from "@/lib/auth";

export type CampaignOrgFks = {
  publisher_org_id: string | null;
  brand_org_id: string | null;
  agency_org_id: string | null;
};

export type ProjectOrgs = {
  brand_org_id: string | null;
  agency_org_id: string | null;
  publisher_org_ids: string[] | null;
};

export type AssociationCheck = { ok: true } | { ok: false; status: 400 | 403; error: string };

/**
 * Pure org-consistency test. Every NON-null campaign organisation FK must be
 * an organisation of the project. If it holds, every organisation that can see
 * the project (its brand/agency/publishers) and therefore the campaign is an
 * organisation the campaign legitimately belongs to — so the cascade cannot
 * surface the campaign to an unrelated organisation. A campaign with no org
 * FKs at all belongs to no organisation and carries no cross-org data.
 */
export function campaignOrgsBelongToProject(campaign: CampaignOrgFks, project: ProjectOrgs): boolean {
  if (campaign.publisher_org_id && !(project.publisher_org_ids ?? []).includes(campaign.publisher_org_id)) return false;
  if (campaign.brand_org_id && campaign.brand_org_id !== project.brand_org_id) return false;
  if (campaign.agency_org_id && campaign.agency_org_id !== project.agency_org_id) return false;
  return true;
}

/**
 * Pure decision core (fully testable). `project` is null when the reference is
 * missing/deleted/unknown → fail closed. `canAccessProject` is the actor's
 * project-access result (admins are passed `true`).
 */
export function evaluateCampaignProjectAssociation(
  role: UserRole,
  project: ProjectOrgs | null,
  canAccessProject: boolean,
  campaign: CampaignOrgFks,
): AssociationCheck {
  if (!project) return { ok: false, status: 400, error: "Invalid research project." };
  if (role !== "admin" && !canAccessProject) {
    return { ok: false, status: 403, error: "You are not authorised to associate a campaign with this research project." };
  }
  if (!campaignOrgsBelongToProject(campaign, project)) {
    return { ok: false, status: 403, error: "This campaign's organisation is not associated with the selected research project." };
  }
  return { ok: true };
}

/** Async wrapper: loads the project, resolves the actor's access, and applies
 *  the pure decision core. Call before writing `research_project_id`. */
export async function assertCampaignProjectAssociation(
  user: AuthedUser,
  projectId: string,
  campaign: CampaignOrgFks,
): Promise<AssociationCheck> {
  const { data: row } = await supabaseAdmin
    .from("research_projects")
    .select("id, brand_org_id, agency_org_id, publisher_org_ids, deleted_at")
    .eq("id", projectId)
    .maybeSingle();

  const project: ProjectOrgs | null = row && !row.deleted_at
    ? { brand_org_id: row.brand_org_id, agency_org_id: row.agency_org_id, publisher_org_ids: row.publisher_org_ids }
    : null;

  const canAccessProject = user.role === "admin"
    ? true
    : project !== null && (await canAccess(user, "research_project", projectId));

  return evaluateCampaignProjectAssociation(user.role, project, canAccessProject, campaign);
}
