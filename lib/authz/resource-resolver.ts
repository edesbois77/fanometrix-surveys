// ORG-005 · IW-6 / G-3 (W6) — DB-backed resource-access resolver (SHADOW).
//
// This wires the accepted PURE resolver (lib/authz/resource-entitlement.ts) to the
// governed Platform-Authorisation state persisted by migrations 170 (entitlement /
// authorisation) and 171 (governed_resources registry + resource_scopes /
// resource_scope_members). It is NON-AUTHORITATIVE: nothing in the live request
// path imports it to make an access decision. It exists for the G-3 shadow
// dual-run and for the eventual, separately-authorised G-3 activation.
//
// It preserves every governed invariant by construction, because all decision
// logic lives in the accepted pure functions — this module only LOADS resolved
// inputs (entitlement rows, authorisation rows, an explicit scope-membership fact)
// and passes them through:
//   • Organisation Resource Entitlement is required (Q-14); User Resource
//     Authorisation only narrows (Q-15).
//   • scope coverage is an EXPLICIT membership lookup (coverage-not-inheritance,
//     Q-18) — never a hierarchy walk.
//   • Report/Data identity is resolved via the governed_resources registry
//     (identity only; never an authorisation surface).
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  resolveResourceAccess,
  type ResourceClass,
  type ResourceRef,
  type OrgEntitlement,
  type UserAuthorisation,
} from "@/lib/authz/resource-entitlement";

/** Resolve the governed uuid for a resource from its natural key.
 *  Study (research_projects.id), Finding (findings.id) and — after the Option-1
 *  Data-granularity refinement — Data (the CAMPAIGN id; Data is per-Campaign) are
 *  addressed by their own PKs and pass straight through. Only Report is registry-
 *  addressed (its identity is a config string, ReportConfig.access.id). Returns
 *  null if a Report resource has no active registry row. */
export async function resolveGovernedResourceId(
  resourceClass: ResourceClass,
  naturalKey: string,
): Promise<string | null> {
  if (resourceClass !== "report") return naturalKey; // study | finding | data → own PK
  const { data } = await supabaseAdmin
    .from("governed_resources")
    .select("id")
    .eq("resource_class", "report")
    .eq("natural_key", naturalKey)
    .eq("status", "active")
    .maybeSingle();
  return data?.id ?? null;
}

/** Active Organisation Resource Entitlements for one organisation + class. */
export async function loadOrgEntitlements(
  organisationId: string,
  resourceClass: ResourceClass,
): Promise<OrgEntitlement[]> {
  const { data } = await supabaseAdmin
    .from("organisation_resource_entitlements")
    .select("organisation_id, resource_class, resource_id, scope_id, status")
    .eq("organisation_id", organisationId)
    .eq("resource_class", resourceClass)
    .eq("status", "active");
  return (data ?? []).map((r) => ({
    organisationId: r.organisation_id,
    resourceClass: r.resource_class as ResourceClass,
    resourceId: r.resource_id,
    scopeId: r.scope_id,
    active: true,
  }));
}

/** Active User Resource Authorisations for one user + class. */
export async function loadUserAuthorisations(
  userId: string,
  resourceClass: ResourceClass,
): Promise<UserAuthorisation[]> {
  const { data } = await supabaseAdmin
    .from("user_resource_authorisations")
    .select("user_id, resource_class, resource_id, scope_id, effect, status")
    .eq("user_id", userId)
    .eq("resource_class", resourceClass)
    .eq("status", "active");
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    resourceClass: r.resource_class as ResourceClass,
    resourceId: r.resource_id,
    scopeId: r.scope_id,
    effect: r.effect as "allow" | "restrict",
    active: true,
  }));
}

/** Explicit scope-membership fact (coverage-not-inheritance): TRUE iff a
 *  membership row exists for (scopeId, ref.class, ref.id). No recursion. */
export async function scopeCoversDb(scopeId: string, ref: ResourceRef): Promise<boolean> {
  const { count } = await supabaseAdmin
    .from("resource_scope_members")
    .select("*", { count: "exact", head: true })
    .eq("scope_id", scopeId)
    .eq("resource_class", ref.resourceClass)
    .eq("resource_id", ref.resourceId);
  return (count ?? 0) > 0;
}

/**
 * The SHADOW resource decision for a principal against a governed resource.
 * `ref.resourceId` must already be the GOVERNED id (study/finding PK, or the
 * governed_resources.id for report/data — use `resolveGovernedResourceId`).
 *
 * Pre-loads scope membership for the org+user scope entitlements so the pure
 * resolver's `scopeCovers` is a synchronous lookup over resolved facts.
 * Non-authoritative — for dual-run / future G-3 only.
 */
export async function resolveResourceForPrincipal(
  principal: { organisationId: string | null; id: string; accessScope: "organisation_wide" | "selected" },
  ref: ResourceRef,
): Promise<boolean> {
  if (!principal.organisationId) return false; // no active organisation → Default Refuse
  const [orgEntitlements, userAuthorisations] = await Promise.all([
    loadOrgEntitlements(principal.organisationId, ref.resourceClass),
    loadUserAuthorisations(principal.id, ref.resourceClass),
  ]);

  // Pre-resolve scope coverage for exactly the scopes referenced by this
  // principal's org/user entitlements (explicit membership; no hierarchy).
  const scopeIds = new Set<string>();
  for (const e of orgEntitlements) if (e.scopeId) scopeIds.add(e.scopeId);
  for (const a of userAuthorisations) if (a.scopeId) scopeIds.add(a.scopeId);
  const covered = new Set<string>();
  await Promise.all([...scopeIds].map(async (sid) => { if (await scopeCoversDb(sid, ref)) covered.add(sid); }));
  const scopeCovers = (scopeId: string, _ref: ResourceRef) => covered.has(scopeId);

  return resolveResourceAccess(ref, {
    orgEntitlements,
    accessScope: principal.accessScope,
    userAuthorisations,
    scopeCovers,
  });
}
