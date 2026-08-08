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
  const session = await getSession(req);
  if (!session) throw unauthorised("Unauthorised", 401);

  // ORG-005 IW-11: the scalar users.organisation_id / users.role and the org join
  // are no longer read here — the Organisation comes from the Active Organisation
  // Context (fetched by id below) and the Role from the contextual binding.
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, work_email, first_name, last_name, access_scope, status, can_present_simulations, remembered_organisation_id, token_version")
    .eq("id", session.sub)
    .single();

  const row = data as UserRow | null;
  if (error || !row) throw unauthorised("Unauthorised", 401);

  // ── ORG-005 IW-9 — session/token currency (F058/F059/SG-8). A session whose
  //    issued version is behind the live users.token_version has been revoked
  //    (explicit revoke, user disable, or password/forced-password-change) →
  //    401 BEFORE the token's natural expiry. Uses the live re-fetch already
  //    performed here (F003), so no extra query. Fail-safe: an undefined version
  //    (legacy token / unset column) is treated as current — never a false
  //    revocation. Anti-resurrection (F060): a stale token never out-votes the
  //    live value. ──
  if (isSessionRevoked(session.tv, row.token_version ?? undefined)) {
    throw unauthorised("Session expired", 401);
  }

  if (row.status !== "active") throw unauthorised("Account disabled", 403);

  // ── ORG-005 G-1/IW-11: the Active Organisation Context is the SOLE authority for
  //    the request Organisation (Q-06/Q-11); its record is fetched by the context
  //    id — no scalar users.organisation_id read. Fail CLOSED if none resolves. ──
  const accessSet = await fetchActiveOrganisationAccess(row.id);
  const ctx = accessSet ? resolveActiveContext(accessSet, row.remembered_organisation_id ?? null) : null;
  if (!ctx?.activeOrganisationId) throw unauthorised("No active organisation context", 403);
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
  const contextualRole = await fetchContextualRole(row.id, organisationId);
  if (contextualRole == null) throw unauthorised("No role for the active organisation context", 403);
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
    id: row.id,
    workEmail: row.work_email,
    firstName: row.first_name,
    lastName: row.last_name,
    role: effectiveRole,
    organisationId,
    organisationName: org?.name ?? null,
    organisationType: org?.type ?? null,
    accessScope: row.access_scope,
    status: row.status,
    canPresentSimulations: row.can_present_simulations,
  };
}
