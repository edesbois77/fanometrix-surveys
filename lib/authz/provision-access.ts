// ORG-005 · IW-11 (ADDITIVE prerequisite) — keep the governed
// user_organisation_access (Active Organisation Context + contextual Role) in
// lockstep with user provisioning, so that under the accepted G-1 sole-authority
// (fail-closed Active Context) a newly created or updated user ALWAYS resolves a
// valid governed context and can never be stranded.
//
// This runs ALONGSIDE the legacy scalar users.organisation_id / users.role writes
// (those columns are dropped only in the later, separately-authorised destructive
// IW-11 phase). It preserves the current single-organisation semantics exactly:
// exactly one active access row per user = its current (organisation, role).
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Reconcile the user's governed Organisation Access to its current provisioning
 * state. Idempotent. Preserves single-org Active Context (exactly one active row):
 *   • no org/role → revoke any active access (mirrors the "no organisation" state);
 *   • else → upsert the (user, org) row ACTIVE with the role, and revoke any other
 *     active rows so the Active Context resolves unambiguously (no selection_required).
 */
export async function syncGovernedOrganisationAccess(
  userId: string,
  organisationId: string | null | undefined,
  role: string | null | undefined,
): Promise<void> {
  if (!organisationId || !role) {
    await supabaseAdmin
      .from("user_organisation_access")
      .update({ status: "revoked" })
      .eq("user_id", userId)
      .eq("status", "active");
    return;
  }
  await supabaseAdmin
    .from("user_organisation_access")
    .upsert(
      { user_id: userId, organisation_id: organisationId, role, status: "active" },
      { onConflict: "user_id,organisation_id" },
    );
  await supabaseAdmin
    .from("user_organisation_access")
    .update({ status: "revoked" })
    .eq("user_id", userId)
    .eq("status", "active")
    .neq("organisation_id", organisationId);
}

/**
 * ORG-005 IW-11 / DEC-1 Option A — Selected Access is preserved for Studies via the
 * governed User Resource Authorisation. `research_project` grants → `study` URA
 * `allow`; campaign / campaign_group / insight grant types are RETIRED and never
 * written. Reconciles the user's study URA `allow` set to the supplied grants
 * (the client sends the full desired set). Replaces the legacy user_access_grants
 * write. No `user_access_grants` row is created.
 */
export async function syncSelectedStudyAuthorisations(
  userId: string,
  grants: { resource_type: string; resource_id: string }[] | undefined,
): Promise<void> {
  await supabaseAdmin
    .from("user_resource_authorisations")
    .delete()
    .eq("user_id", userId)
    .eq("resource_class", "study")
    .eq("effect", "allow");
  const studyIds = [...new Set((grants ?? []).filter((g) => g.resource_type === "research_project").map((g) => g.resource_id))];
  if (studyIds.length) {
    await supabaseAdmin.from("user_resource_authorisations").insert(
      studyIds.map((rid) => ({ user_id: userId, resource_class: "study", resource_id: rid, effect: "allow", status: "active" })),
    );
  }
}

/** Display helper — the user's Selected Access as `research_project` grant shapes,
 *  read from the governed Study URA (replaces the legacy user_access_grants read). */
export async function selectedStudyGrantsForDisplay(userId: string): Promise<{ resource_type: string; resource_id: string }[]> {
  const { data } = await supabaseAdmin
    .from("user_resource_authorisations")
    .select("resource_id")
    .eq("user_id", userId)
    .eq("resource_class", "study")
    .eq("effect", "allow")
    .eq("status", "active");
  return (data ?? []).map((r) => ({ resource_type: "research_project", resource_id: r.resource_id as string }));
}
