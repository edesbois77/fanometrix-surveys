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
