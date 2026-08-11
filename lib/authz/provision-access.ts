// ORG-005 · IW-11 (ADDITIVE prerequisite) — keep the governed
// user_organisation_access (Active Organisation Context + contextual Role) in
// lockstep with user provisioning, so that under the accepted G-1 sole-authority
// (fail-closed Active Context) a newly created or updated user ALWAYS resolves a
// valid governed context and can never be stranded.
//
// ORG-006 · WP-01 (IS-01) — provisioning now supports the governed 0/1/many
// Organisation Access model: an Access SET can be reconciled, and specific
// associations granted/revoked, WITHOUT automatically collapsing the set to a
// single association. The authoritative access model itself is unchanged; this is
// context/access provisioning, never a permission union (a single Current
// Organisation is resolved at request time — see resolveActiveContext).
import { supabaseAdmin } from "@/lib/supabase-admin";

export interface OrganisationAssignment {
  organisationId: string;
  role: string;
}

/**
 * ORG-006 WP-01 — Reconcile a user's governed Organisation Access to EXACTLY the
 * supplied set of (organisation, role) assignments. Grants/retains each listed
 * association ACTIVE and revokes only active associations NOT in the set. It never
 * collapses to a single association merely because one is added or maintained, so a
 * user can legitimately hold zero, one OR many active associations. Idempotent.
 *
 * This provisions ACCESS (the Accessible Organisation Set), which is distinct from
 * Current Organisation and does not union permissions across organisations.
 */
export async function setOrganisationAccessSet(
  userId: string,
  assignments: OrganisationAssignment[],
): Promise<void> {
  const desired = assignments.filter((a) => a.organisationId && a.role);
  if (desired.length === 0) {
    // No organisation → revoke any active access (the governed "no organisation" state).
    await supabaseAdmin
      .from("user_organisation_access")
      .update({ status: "revoked" })
      .eq("user_id", userId)
      .eq("status", "active");
    return;
  }
  // Grant/retain every desired association ACTIVE (upsert on the (user,org) key).
  await supabaseAdmin
    .from("user_organisation_access")
    .upsert(
      desired.map((a) => ({ user_id: userId, organisation_id: a.organisationId, role: a.role, status: "active" })),
      { onConflict: "user_id,organisation_id" },
    );
  // Revoke ONLY active associations that are not in the desired set — never the
  // ones being granted/maintained. No automatic single-collapse.
  const keep = new Set(desired.map((a) => a.organisationId));
  const { data: active } = await supabaseAdmin
    .from("user_organisation_access")
    .select("organisation_id")
    .eq("user_id", userId)
    .eq("status", "active");
  const toRevoke = (active ?? []).map((r) => r.organisation_id as string).filter((id) => !keep.has(id));
  if (toRevoke.length) {
    await supabaseAdmin
      .from("user_organisation_access")
      .update({ status: "revoked" })
      .eq("user_id", userId)
      .eq("status", "active")
      .in("organisation_id", toRevoke);
  }
}

/**
 * ORG-006 WP-01 — grant/retain a SINGLE association ACTIVE without disturbing the
 * user's other active associations (additive access grant, no collapse).
 */
export async function grantOrganisationAccess(userId: string, organisationId: string, role: string): Promise<void> {
  await supabaseAdmin
    .from("user_organisation_access")
    .upsert({ user_id: userId, organisation_id: organisationId, role, status: "active" }, { onConflict: "user_id,organisation_id" });
}

/**
 * ORG-006 WP-01 — revoke a SINGLE association (leaves the rest of the Accessible
 * Organisation Set intact). This is an ACCESS change, never a context switch.
 */
export async function revokeOrganisationAccess(userId: string, organisationId: string): Promise<void> {
  await supabaseAdmin
    .from("user_organisation_access")
    .update({ status: "revoked" })
    .eq("user_id", userId)
    .eq("organisation_id", organisationId)
    .eq("status", "active");
}

/**
 * Reconcile the user's governed Organisation Access from a SINGLE (organisation,
 * role) provisioning input — the inherited single-Organisation provisioning path.
 * Delegates to setOrganisationAccessSet with a one- or zero-element set, so the
 * end state is IDENTICAL to the prior behaviour (exactly that organisation active,
 * any others revoked). Retained for backward compatibility of existing call sites.
 */
export async function syncGovernedOrganisationAccess(
  userId: string,
  organisationId: string | null | undefined,
  role: string | null | undefined,
): Promise<void> {
  await setOrganisationAccessSet(userId, organisationId && role ? [{ organisationId, role }] : []);
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

export interface GovernedUserContext {
  organisation_id: string | null;
  role: string | null;
  organisations: { name: string; type: string } | null;
}
const EMPTY_CTX: GovernedUserContext = { organisation_id: null, role: null, organisations: null };

/** ORG-005 IW-11 — a user's Organisation + Role for DISPLAY, sourced from the
 *  governed user_organisation_access (active), replacing the scalar
 *  users.organisation_id / users.role display reads. Keyed by user id. */
export async function governedUserContexts(userIds: string[]): Promise<Map<string, GovernedUserContext>> {
  const map = new Map<string, GovernedUserContext>();
  if (!userIds.length) return map;
  // ORG-006 — a user's PRIMARY Organisation is the EARLIEST-established active
  // association (deterministic by created_at, tie-broken by organisation_id). This
  // makes the displayed Primary stable: adding/removing ADDITIONAL Organisation
  // access does not change it, and switching Current Organisation (which writes
  // users.remembered_organisation_id — a DIFFERENT field, never touched here) does
  // not change it either. Ordered ASC + first-wins per user selects that primary.
  const { data } = await supabaseAdmin
    .from("user_organisation_access")
    .select("user_id, organisation_id, role, created_at, organisations ( name, type )")
    .in("user_id", userIds)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .order("organisation_id", { ascending: true });
  for (const r of data ?? []) {
    if (map.has(r.user_id as string)) continue; // first (earliest) wins = the Primary
    const org = Array.isArray(r.organisations) ? r.organisations[0] : r.organisations;
    map.set(r.user_id as string, { organisation_id: r.organisation_id as string, role: r.role as string, organisations: (org as GovernedUserContext["organisations"]) ?? null });
  }
  return map;
}

/**
 * ORG-006 — persist an EXPLICIT Primary Organisation designation. The Primary is
 * the earliest-established active association (see governedUserContexts); this
 * anchors `organisationId` as that primary by making it the earliest, so that an
 * admin explicitly changing the Primary field takes effect and is stable. It is a
 * no-op when the organisation is already the primary. It NEVER touches
 * users.remembered_organisation_id (the Current Organisation) and never changes the
 * access set — Primary, Current and Additional access remain distinct.
 */
export async function setPrimaryOrganisation(userId: string, organisationId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("user_organisation_access")
    .select("organisation_id, created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .order("organisation_id", { ascending: true });
  const rows = (data ?? []) as { organisation_id: string; created_at: string }[];
  if (!rows.length || rows[0].organisation_id === organisationId) return; // absent or already primary
  const anchored = new Date(new Date(rows[0].created_at).getTime() - 1000).toISOString();
  await supabaseAdmin
    .from("user_organisation_access")
    .update({ created_at: anchored })
    .eq("user_id", userId)
    .eq("organisation_id", organisationId)
    .eq("status", "active");
}

/** Single-user governed display context (Organisation + Role) from the active
 *  user_organisation_access row. When a user holds MANY active associations this
 *  returns the first the DB yields — callers needing the full set use
 *  governedUserAccessSet below (it is a display convenience only, not authority). */
export async function governedUserContext(userId: string): Promise<GovernedUserContext> {
  return (await governedUserContexts([userId])).get(userId) ?? { ...EMPTY_CTX };
}

export interface OrganisationAccessRow {
  organisation_id: string;
  role: string | null;
  name: string | null;
  type: string | null;
}

/** ORG-006 WP-01 — a user's FULL active Organisation Access set (the Accessible
 *  Organisation Set, with Organisation name/type and per-context role) for the
 *  provisioning-administration surface. Zero, one or many rows. Reuses the governed
 *  user_organisation_access table — it never introduces a second access model. */
export async function governedUserAccessSet(userId: string): Promise<OrganisationAccessRow[]> {
  const { data } = await supabaseAdmin
    .from("user_organisation_access")
    .select("organisation_id, role, organisations ( name, type )")
    .eq("user_id", userId)
    .eq("status", "active");
  return (data ?? []).map((r) => {
    const org = Array.isArray(r.organisations) ? r.organisations[0] : r.organisations;
    return {
      organisation_id: r.organisation_id as string,
      role: (r.role as string) ?? null,
      name: (org as { name?: string } | null)?.name ?? null,
      type: (org as { type?: string } | null)?.type ?? null,
    };
  });
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
