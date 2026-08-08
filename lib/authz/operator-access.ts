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
import { evaluateExceptionalAccess, type ExceptionalAccessGrant } from "@/lib/authz/exceptional-access";
import { recordSecurityEvent } from "@/lib/authz/audit";

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
 * The specific resource ids a principal may access via CURRENT Exceptional Resource
 * Access (bounded, invoked, eligible, unexpired) for a resource type — the
 * break-glass path used only when no standing entitlement covers the domain. Each
 * granted use emits a mandatory IW-7 audit event (Q-29). `now` from the request clock.
 */
async function exceptionalResourceIds(userId: string, resourceType: string, now: number): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("exceptional_resource_access")
    .select("id, principal_user_id, eligible, invoked, purpose, resource_type, resource_id, scope_id, operation, expires_at")
    .eq("principal_user_id", userId)
    .eq("status", "active")
    .eq("resource_type", resourceType)
    .not("resource_id", "is", null);
  const ids: string[] = [];
  for (const g of data ?? []) {
    const grant: ExceptionalAccessGrant = {
      principalUserId: g.principal_user_id, eligible: g.eligible, invoked: g.invoked, purpose: g.purpose,
      resourceType: g.resource_type, resourceId: g.resource_id, scopeId: g.scope_id, operation: g.operation,
      expiresAt: new Date(g.expires_at as string).getTime(),
    };
    const decision = evaluateExceptionalAccess(grant, { principalUserId: userId, resourceType, resourceId: g.resource_id, scopeId: g.scope_id, operation: g.operation, now });
    if (decision.granted) {
      ids.push(g.resource_id as string);
      // Mandatory IW-7 audit on break-glass use (references/meaning only).
      await recordSecurityEvent({ eventType: "exceptional_resource_access", action: "resource_access", outcome: "authorised", actorUserId: userId, resourceType, resourceId: g.resource_id as string, detail: { grantId: g.id, purpose: g.purpose } });
    }
  }
  return ids;
}

/**
 * AUTHORITATIVE (G-2) resource visibility for a platform operator, replacing the
 * `role === "admin" → null` super-ALLOW. Routine access comes from the explicit
 * Platform-Operator standing entitlement: an entitled domain → `null` (unrestricted
 * for that domain, exactly as before but contingent + revocable + DENY-subordinate);
 * otherwise Default Refuse, with any bounded Exceptional Access supplying specific
 * ids. NEVER role-inferred.
 */
export async function operatorVisibleResourceIds(
  user: AuthedUser,
  resourceType: "research_project" | "campaign" | "campaign_group" | "insight",
): Promise<string[] | null> {
  const domains = await loadOperatorDomains(user.id);
  if (adminResourceVisibility(domains, domainForResourceType(resourceType)) === "all") return null;
  return exceptionalResourceIds(user.id, resourceType, Date.now());
}

/** AUTHORITATIVE (G-2) operator Data-campaign visibility, replacing the admin
 *  super-ALLOW in `dataVisibleCampaignIds`. Entitled `data` domain → `null` (all);
 *  else Default Refuse + bounded Exceptional Access (resource_type "data"). */
export async function operatorVisibleDataCampaignIds(user: AuthedUser): Promise<string[] | null> {
  const domains = await loadOperatorDomains(user.id);
  if (adminResourceVisibility(domains, "data") === "all") return null;
  return exceptionalResourceIds(user.id, "data", Date.now());
}
