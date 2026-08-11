// Node-only. The authoritative per-request authorization check. Never
// import this in middleware.ts (Edge runtime) — use lib/auth.ts's
// getSession() there instead for coarse, non-authoritative routing.
//
// Unlike the old requireSession() (removed from lib/auth.ts), this always
// re-fetches the user's current status/role/organisation/access scope
// from the database rather than trusting the JWT, so disabling a user or
// their organisation, or changing their role/access, takes effect on
// their very next request instead of waiting for the session to expire.
import type { NextRequest } from "next/server";
import { getSession, type UserRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
// ORG-005 G-1: the governed per-slice resolutions below are the SOLE authority.
// The transitional shadow observers (lib/authz/shadow) and the shadow decision
// seam (lib/authz/decision.evaluate) have been retired; the legacy fail-safe
// fallbacks (scalar org, legacy role, legacy product allow-set) are removed —
// governed-source completeness was proven by full-population census before removal.
import { fetchActiveOrganisationAccess, resolveActiveContext } from "@/lib/authz/organisation-access";
import { fetchContextualRole, resolveEffectiveRole } from "@/lib/authz/role-profile";
import { resolveProductAccess, tierForAllowedRoles } from "@/lib/authz/product-access";
import { isSessionRevoked } from "@/lib/authz/session-currency";
// ORG-007 CF-003 (NFR-005) — operational detection/diagnosis for material
// Organisation Context resolution failures. Emits to the platform log ONLY on the
// failure branches (never on the resolved happy path, so the hot path is untouched)
// and NEVER alters the Response or the authorisation outcome.
import { reportOrganisationContext } from "@/lib/observability/operational-telemetry";

export type OrganisationType = "publisher" | "agency" | "brand" | "internal";

export type AuthedUser = {
  id: string;
  workEmail: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  organisationId: string | null;
  organisationName: string | null;
  organisationType: OrganisationType | null;
  accessScope: "organisation_wide" | "selected";
  status: "pending_invitation" | "active" | "disabled";
  /** Capability grant, not a role — admins can always do this regardless
   * of this flag; checked separately wherever Simulation access is
   * gated (never a substitute for the admin role check). */
  canPresentSimulations: boolean;
};

type UserRow = {
  id: string;
  work_email: string;
  first_name: string | null;
  last_name: string | null;
  role: UserRole;
  organisation_id: string | null;
  access_scope: "organisation_wide" | "selected";
  status: "pending_invitation" | "active" | "disabled";
  can_present_simulations: boolean;
  remembered_organisation_id: string | null;
  token_version: number | null;
  organisations: { name: string; type: OrganisationType; status: "active" | "disabled" } | { name: string; type: OrganisationType; status: "active" | "disabled" }[] | null;
};

type OrgRecord = { name: string; type: OrganisationType; status: "active" | "disabled" } | null;

function unauthorised(message: string, status: 401 | 403): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ORG-006 WP-01 (IS-01) — a multi-Organisation user with NO validly remembered
// Current Organisation is in the governed `selection_required` state: a legitimate
// authenticated user who must CHOOSE one Organisation from their authoritative
// Accessible Organisation Set before Organisation-scoped activity may proceed. This
// is NOT an access failure — it is surfaced as a DISTINCT, machine-readable signal
// so the client can drive the governed selection journey, rather than collapsing
// into a generic 403 (which remains reserved for genuinely no/​indeterminate access).
function selectionRequired(): Response {
  return new Response(
    JSON.stringify({ error: "Organisation selection required", code: "organisation_selection_required" }),
    { status: 409, headers: { "Content-Type": "application/json" } },
  );
}

/** ORG-006 WP-01 — the authenticated identity, resolved WITHOUT Organisation
 *  context. Identity (users.id) is independent of Organisation context; the
 *  Organisation is resolved separately (requireUser / resolveOrganisationContextView).
 *  Used by the context-selection/switch surfaces, which must work for a user who is
 *  authenticated but has not yet selected a Current Organisation. */
export type Identity = {
  id: string;
  workEmail: string;
  firstName: string | null;
  lastName: string | null;
  accessScope: "organisation_wide" | "selected";
  status: "pending_invitation" | "active" | "disabled";
  canPresentSimulations: boolean;
  rememberedOrganisationId: string | null;
};

/** Verify the session and load the live identity (status/currency), with NO
 *  Organisation-context resolution. Throws a Response (401/403) exactly like
 *  requireUser for genuinely invalid/disabled sessions. Fail-closed. */
async function loadIdentity(req: Request | NextRequest): Promise<Identity> {
  const session = await getSession(req);
  if (!session) throw unauthorised("Unauthorised", 401);

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, work_email, first_name, last_name, access_scope, status, can_present_simulations, remembered_organisation_id, token_version")
    .eq("id", session.sub)
    .single();

  const row = data as UserRow | null;
  if (error || !row) throw unauthorised("Unauthorised", 401);

  // ORG-005 IW-9 — session/token currency (F058/F059/SG-8). Fail-safe: an
  // undefined live version is treated as current (never a false revocation).
  if (isSessionRevoked(session.tv, row.token_version ?? undefined)) {
    throw unauthorised("Session expired", 401);
  }
  if (row.status !== "active") throw unauthorised("Account disabled", 403);

  return {
    id: row.id,
    workEmail: row.work_email,
    firstName: row.first_name,
    lastName: row.last_name,
    accessScope: row.access_scope,
    status: row.status,
    canPresentSimulations: row.can_present_simulations,
    rememberedOrganisationId: row.remembered_organisation_id ?? null,
  };
}

/** Public identity-only guard for the Organisation context-selection/switch
 *  surfaces (they must not require an already-resolved Current Organisation). */
export async function requireIdentity(req: Request | NextRequest): Promise<Identity> {
  return loadIdentity(req);
}

/**
 * Verify the session and load the user's current, live authorization
 * state. Throws a Response (401/403) for use in API route handlers —
 * matching the old requireSession() calling convention, so most call
 * sites only need their import updated.
 */
export async function requireUser(
  req: Request | NextRequest,
  allowedRoles?: UserRole[]
): Promise<AuthedUser> {
  // ORG-006 WP-01: identity (status/currency) first, then Organisation context.
  const identity = await loadIdentity(req);

  // ── ORG-005 G-1/IW-11 + ORG-006 WP-01: the Active Organisation Context is the SOLE
  //    authority for the request Organisation (Q-06/Q-11). fetchActiveOrganisationAccess
  //    returns the authoritative Accessible Organisation Set (0/1/many); resolveActiveContext
  //    reduces it to a SINGLE Current Organisation (never a union). Fail CLOSED when the
  //    source is indeterminate or access is empty; surface selection_required distinctly. ──
  const accessSet = await fetchActiveOrganisationAccess(identity.id);
  if (accessSet === null) {
    reportOrganisationContext({ phase: "request", userId: identity.id, accessIndeterminate: true, accessSetSize: 0, activeOrganisationId: null, contextualRole: null });
    throw unauthorised("No active organisation context", 403); // indeterminate → fail closed
  }
  const ctx = resolveActiveContext(accessSet, identity.rememberedOrganisationId);
  if (ctx.status === "selection_required") throw selectionRequired(); // GOVERNED state, not a failure — no signal
  if (!ctx.activeOrganisationId) {
    reportOrganisationContext({ phase: "request", userId: identity.id, accessIndeterminate: false, accessSetSize: accessSet.length, activeOrganisationId: null, contextualRole: null });
    throw unauthorised("No active organisation context", 403); // no_access
  }
  const organisationId = ctx.activeOrganisationId;
  const { data: activeOrgRow } = await supabaseAdmin
    .from("organisations").select("name, type, status")
    .eq("id", organisationId).single();
  const org: OrgRecord = (activeOrgRow as OrgRecord) ?? null;

  // ── ORG-005 G-1: the contextual Role (bound to the Active Organisation Context)
  //    is the SOLE authority (Q-11; REPLACE F010). The legacy global users.role is
  //    no longer a fallback (census proved every active user has a contextual
  //    binding with zero divergence). Fail CLOSED if none — never a silent
  //    legacy-role fallback. No cross-Organisation carry-over: read for the active
  //    context only. ──
  const contextualRole = await fetchContextualRole(identity.id, organisationId);
  if (contextualRole == null) {
    // The login-role projection failure class: a Current Organisation resolved but
    // no contextual role binds to it. Surface a diagnosable operational signal
    // (capability + reason + user/org ids, no role value) before the generic 403.
    reportOrganisationContext({ phase: "request", userId: identity.id, accessIndeterminate: false, accessSetSize: accessSet.length, activeOrganisationId: organisationId, contextualRole: null });
    throw unauthorised("No role for the active organisation context", 403);
  }
  const effectiveRole: UserRole = resolveEffectiveRole(contextualRole, contextualRole).role;

  // Admins bypass the organisation-disabled check so a disabled internal
  // organisation can never accidentally lock every admin out at once.
  if (effectiveRole !== "admin" && org?.status === "disabled") {
    throw unauthorised("Organisation disabled", 403);
  }

  // ── ORG-005 G-1: Product Access is decided SOLELY by the governed model (Q-09).
  //    Every governed call-site allow-set maps to a governed tier (proven by
  //    census); a non-mapping set is a misconfiguration → fail CLOSED (no legacy
  //    allowedRoles.includes() fallback). Behaviour unchanged (exhaustive parity). ──
  if (allowedRoles) {
    const tier = tierForAllowedRoles(allowedRoles);
    const allowed = tier !== null && resolveProductAccess({ role: effectiveRole, tier });
    if (!allowed) throw unauthorised("Forbidden", 403);
  }

  return {
    id: identity.id,
    workEmail: identity.workEmail,
    firstName: identity.firstName,
    lastName: identity.lastName,
    role: effectiveRole,
    organisationId,
    organisationName: org?.name ?? null,
    organisationType: org?.type ?? null,
    accessScope: identity.accessScope,
    status: identity.status,
    canPresentSimulations: identity.canPresentSimulations,
  };
}

/** ORG-006 WP-01 — the platform-owned Organisation Context VIEW for a resolved
 *  identity: the authoritative Accessible Organisation Set (with names), the
 *  resolved Current Organisation, and the governed status. Reuses the SAME governed
 *  machinery as requireUser (fetchActiveOrganisationAccess + resolveActiveContext) —
 *  it never introduces a second access model, and never unions permissions. Exposed
 *  to the logged-in client (via /api/auth/me) so the governed selection/switching
 *  experience can operate. Fail-closed: an indeterminate source reports no context. */
export interface OrganisationContextView {
  status: "resolved" | "selection_required" | "no_access" | "indeterminate";
  currentOrganisationId: string | null;
  accessibleOrganisations: { id: string; name: string | null }[];
}

export async function resolveOrganisationContextView(identity: Identity): Promise<OrganisationContextView> {
  const accessSet = await fetchActiveOrganisationAccess(identity.id);
  if (accessSet === null) {
    return { status: "indeterminate", currentOrganisationId: null, accessibleOrganisations: [] };
  }
  const ctx = resolveActiveContext(accessSet, identity.rememberedOrganisationId);
  let accessible: { id: string; name: string | null }[] = [];
  if (accessSet.length) {
    const { data } = await supabaseAdmin.from("organisations").select("id, name").in("id", accessSet);
    const byId = new Map((data ?? []).map((o) => [o.id as string, (o.name as string) ?? null]));
    accessible = accessSet.map((id) => ({ id, name: byId.get(id) ?? null }));
  }
  const status: OrganisationContextView["status"] =
    ctx.status === "resolved" ? "resolved" : ctx.status === "no_access" ? "no_access" : "selection_required";
  return { status, currentOrganisationId: ctx.activeOrganisationId, accessibleOrganisations: accessible };
}
