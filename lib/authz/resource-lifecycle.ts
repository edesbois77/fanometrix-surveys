// ORG-005 · G-3 (W7) — resource/scope lifecycle reconciliation.
//
// §9-D obligation: stale or orphaned scope membership and entitlement MUST NOT
// remain authoritatively effective after a resource is retired/deleted. The
// accepted model uses a polymorphic, opaque resource_id (no per-class FK), so
// referential integrity is maintained by this reconciliation on the jobs
// framework rather than by DB cascade (see [[jobs-framework]]).
//
// It is safe/additive: it maintains only the governed Platform-Authorisation
// tables (registry status, entitlement status, scope membership). Because
// enforcement is SHADOW until G-3, this changes no live authority — and once G-3
// is authoritative, retirement provably removes authority BY CONSTRUCTION: the
// resolver filters `status = 'active'` on both governed_resources and
// organisation_resource_entitlements, so a retired resource is unresolvable and a
// revoked entitlement is excluded.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { registerHandler } from "@/lib/jobs/registry";

export interface GovernedResourceRow { id: string; resource_class: "report" | "data"; natural_key: string; status: string; }

export interface LifecycleActions {
  retireGovernedIds: string[];   // governed_resources rows whose underlying object is gone
  reasons: Record<string, string>;
}

/**
 * PURE — decide which report/data registry rows are now orphaned. A `data` row is
 * orphaned when its Study (natural_key = research_project_id) no longer exists (or
 * is deleted); a `report` row is orphaned when its config id is no longer
 * registered. Study/Finding are addressed by their own PKs and are not registered,
 * so they need no registry retirement (their ORE is revoked directly on deletion).
 */
export function computeLifecycleActions(
  governed: GovernedResourceRow[],
  existingStudyIds: Set<string>,
  registeredReportIds: Set<string>,
): LifecycleActions {
  const retireGovernedIds: string[] = [];
  const reasons: Record<string, string> = {};
  for (const g of governed) {
    if (g.status !== "active") continue;
    if (g.resource_class === "data" && !existingStudyIds.has(g.natural_key)) {
      retireGovernedIds.push(g.id); reasons[g.id] = `data resource orphaned — Study ${g.natural_key} missing/deleted`;
    } else if (g.resource_class === "report" && !registeredReportIds.has(g.natural_key)) {
      retireGovernedIds.push(g.id); reasons[g.id] = `report resource orphaned — config ${g.natural_key} no longer registered`;
    }
  }
  return { retireGovernedIds, reasons };
}

/** Reconcile the governed tables against live resources. Returns a summary. Only
 *  the report/data registry is validated here (study/finding ORE is revoked when
 *  those PKs are deleted — reconciled via the same sweep below). */
export async function reconcileResourceLifecycle(registeredReportIds: Set<string>): Promise<{ retiredResources: number; revokedEntitlements: number; prunedMembers: number }> {
  const { data: governed } = await supabaseAdmin.from("governed_resources").select("id, resource_class, natural_key, status");
  const { data: studies } = await supabaseAdmin.from("research_projects").select("id").is("deleted_at", null);
  const existingStudyIds = new Set((studies ?? []).map((r) => r.id as string));

  const { retireGovernedIds } = computeLifecycleActions((governed ?? []) as GovernedResourceRow[], existingStudyIds, registeredReportIds);

  let revoked = 0, pruned = 0;
  if (retireGovernedIds.length) {
    await supabaseAdmin.from("governed_resources").update({ status: "retired" }).in("id", retireGovernedIds);
    // Revoke entitlements/authorisations that target a now-retired data/report id,
    // and prune its scope memberships — authority removed for the orphaned resource.
    const r1 = await supabaseAdmin.from("organisation_resource_entitlements").update({ status: "revoked" }).in("resource_id", retireGovernedIds).eq("status", "active").select("id");
    const r2 = await supabaseAdmin.from("user_resource_authorisations").update({ status: "revoked" }).in("resource_id", retireGovernedIds).eq("status", "active").select("id");
    const r3 = await supabaseAdmin.from("resource_scope_members").delete().in("resource_id", retireGovernedIds).select("scope_id");
    revoked = (r1.data?.length ?? 0) + (r2.data?.length ?? 0);
    pruned = r3.data?.length ?? 0;
  }
  // Study/Finding entitlements whose PK was deleted: revoke study ORE for missing studies.
  const { data: studyORE } = await supabaseAdmin.from("organisation_resource_entitlements").select("id, resource_id").eq("resource_class", "study").eq("status", "active").not("resource_id", "is", null);
  const staleStudyOre = (studyORE ?? []).filter((r) => r.resource_id && !existingStudyIds.has(r.resource_id as string)).map((r) => r.id);
  if (staleStudyOre.length) { await supabaseAdmin.from("organisation_resource_entitlements").update({ status: "revoked" }).in("id", staleStudyOre); revoked += staleStudyOre.length; }

  return { retiredResources: retireGovernedIds.length, revokedEntitlements: revoked, prunedMembers: pruned };
}

// Register the reconciliation as a job type. INERT until enqueued/scheduled (not
// done here) — registration alone starts nothing.
export const RESOURCE_LIFECYCLE_JOB = "resource-lifecycle-reconcile";
registerHandler(RESOURCE_LIFECYCLE_JOB, {
  run: async ({ payload, log }) => {
    const reportIds = Array.isArray(payload?.registeredReportIds) ? new Set(payload.registeredReportIds as string[]) : new Set<string>(["fedex-ucl-sponsorship"]);
    const summary = await reconcileResourceLifecycle(reportIds);
    log(`resource-lifecycle: retired=${summary.retiredResources} revoked=${summary.revokedEntitlements} pruned=${summary.prunedMembers}`);
  },
});
