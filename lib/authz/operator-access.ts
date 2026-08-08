// ORG-005 · G-2 — Platform-Operator standing entitlement + the prepared (SHADOW)
// replacement for the lib/access.ts `role === "admin" → null` super-ALLOW.
//
// This BUILDS the replacement alongside the live super-ALLOW; it is NOT wired into
// the live decision path and does NOT remove the super-ALLOW (that is the separately
// authorised G-2 cut-over). It resolves what an admin/operator's resource visibility
// WOULD be under the approved model, so cut-over readiness can be validated in shadow.
//
// Governing distinctions (all preserved):
//   • administer ≠ possess — resource visibility here comes ONLY from a
//     Platform-Operator standing entitlement, NEVER from Scoped Platform
//     Administration Authority and NEVER from `role === "admin"`.
//   • the standing entitlement is explicit, per-domain, revocable, attributable,
//     audited (IW-7 at grant/use) and DENY-subordinate — not a super-ALLOW.
//   • Exceptional Resource Access stays bounded, invoked, time-boxed break-glass.
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AuthedUser } from "@/lib/auth-server";
import { domainForResourceType, type OperatorResourceDomain } from "@/lib/authz/admin-operations";

export interface OperatorEntitlement {
  subjectUserId: string;
  resourceDomain: OperatorResourceDomain;
  active?: boolean;
}

/** PURE — does the operator hold a CURRENT standing entitlement for the domain?
 *  Explicit membership only; role is never consulted here. */
export function operatorGrantsDomain(entitlements: OperatorEntitlement[], domain: OperatorResourceDomain): boolean {
  return entitlements.some((e) => e.active !== false && e.resourceDomain === domain);
}

/**
 * PURE — the prepared replacement decision for the resource super-ALLOW. Given the
 * operator's standing-entitlement domains, resource visibility for `domain` is:
 *   • "all"  — an explicit standing entitlement covers the domain (routine access);
 *   • "none" — no standing entitlement (Default Refuse; NOT role-inferred).
 * This is domain-scoped and DENY-subordinate: unlike the super-ALLOW it is not an
 * unconditional bypass — it is contingent on an explicit, revocable grant, and an
 * explicit DENY at the decision layer still refuses.
 */
export function adminResourceVisibility(
  entitledDomains: Set<OperatorResourceDomain>,
  domain: OperatorResourceDomain,
): "all" | "none" {
  return entitledDomains.has(domain) ? "all" : "none";
}

/** Load the operator's active standing-entitlement domains. */
export async function loadOperatorDomains(userId: string): Promise<Set<OperatorResourceDomain>> {
  const { data } = await supabaseAdmin
    .from("platform_operator_entitlements")
    .select("resource_domain")
    .eq("subject_user_id", userId)
    .eq("status", "active");
  return new Set((data ?? []).map((r) => r.resource_domain as OperatorResourceDomain));
}

/**
 * SHADOW — what `visibleResourceIds`/`dataVisibleCampaignIds` WOULD return for this
 * admin/operator under the approved replacement: `null` (unrestricted for the domain,
 * exactly as the super-ALLOW does today) when a standing entitlement covers it, else
 * `[]` (Default Refuse; break-glass Exceptional Access would supply specific ids).
 * NOT wired to the live path — used only for cut-over readiness validation.
 */
export async function resolveAdminVisibilityShadow(
  user: AuthedUser,
  resourceType: "research_project" | "campaign" | "campaign_group" | "insight" | "data",
): Promise<string[] | null> {
  const domains = await loadOperatorDomains(user.id);
  return adminResourceVisibility(domains, domainForResourceType(resourceType)) === "all" ? null : [];
}
