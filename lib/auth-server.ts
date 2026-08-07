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
import { evaluate } from "@/lib/authz/decision";
import { recordShadow, recordOrgContextParity } from "@/lib/authz/shadow";
import { fetchActiveOrganisationAccess, resolveActiveContext, compareAccessToScalar } from "@/lib/authz/organisation-access";

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

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, work_email, first_name, last_name, role, organisation_id, access_scope, status, can_present_simulations, remembered_organisation_id, organisations ( name, type, status )")
    .eq("id", session.sub)
    .single();

  const row = data as UserRow | null;
  if (error || !row) throw unauthorised("Unauthorised", 401);

  // ── ORG-005 IW-0 shadow (non-authoritative; must NEVER affect the request) ──
  // Evaluate the central decision seam on the same resolved inputs and compare
  // to the legacy structural+role outcome. The legacy checks below remain
  // authoritative and unchanged; any shadow error is swallowed.
  try {
    const shadowOrg = Array.isArray(row.organisations) ? row.organisations[0] : row.organisations;
    const legacyAllowed =
      row.status === "active" &&
      (row.role === "admin" || shadowOrg?.status !== "disabled") &&
      (!allowedRoles || allowedRoles.includes(row.role));
    recordShadow("requireUser", evaluate({
      session: "present",
      principalStatus: row.status === "active" ? "active" : "inactive",
      role: row.role,
      isAdmin: row.role === "admin",
      orgStatus: shadowOrg == null ? "none" : (shadowOrg.status === "disabled" ? "disabled" : "active"),
      allowedRoles: allowedRoles ?? undefined,
      resourceVisibility: "not_applicable",
      explicitDeny: null,
    }), legacyAllowed);
  } catch { /* shadow observation must never break authorisation */ }

  if (row.status !== "active") throw unauthorised("Account disabled", 403);

  const scalarOrg: OrgRecord = Array.isArray(row.organisations) ? (row.organisations[0] ?? null) : (row.organisations ?? null);

  // ── ORG-005 IW-1 read cut-over: the Active Organisation Context is now the
  //    authoritative Organisation for this request, resolved from the live
  //    User–Organisation Access set + the remembered/preferred context
  //    (validated). The scalar users.organisation_id is RETAINED as the
  //    governed fallback (decommission is IW-11). Fail-safe: any unavailability
  //    or an unresolved context falls back to the scalar so a user is never
  //    stranded, and this preserves current single-organisation behaviour
  //    exactly (proven by the full-population parity census). ──
  let organisationId = row.organisation_id; // fallback (retained)
  let org: OrgRecord = scalarOrg;           // fallback org record
  try {
    const accessSet = await fetchActiveOrganisationAccess(row.id);
    if (accessSet !== null) {
      recordOrgContextParity(compareAccessToScalar(row.organisation_id, accessSet).parity);
      const ctx = resolveActiveContext(accessSet, row.remembered_organisation_id ?? null);
      if (ctx.activeOrganisationId) {
        organisationId = ctx.activeOrganisationId;
        if (ctx.activeOrganisationId !== row.organisation_id) {
          // Active org differs from the scalar (not the case for current
          // single-org data) — fetch its record for correct name/type/status.
          const { data: activeOrgRow } = await supabaseAdmin
            .from("organisations").select("name, type, status")
            .eq("id", ctx.activeOrganisationId).single();
          org = (activeOrgRow as OrgRecord) ?? null;
        }
      }
      // ctx.activeOrganisationId null (no_access / selection_required) →
      // keep the scalar fallback (never strands a user; preserves behaviour).
    }
    // accessSet null (source unavailable) → keep the scalar fallback.
  } catch { /* fail-safe: the scalar remains authoritative */ }

  // Admins bypass the organisation-disabled check so a disabled internal
  // organisation can never accidentally lock every admin out at once.
  if (row.role !== "admin" && org?.status === "disabled") {
    throw unauthorised("Organisation disabled", 403);
  }

  if (allowedRoles && !allowedRoles.includes(row.role)) {
    throw unauthorised("Forbidden", 403);
  }

  return {
    id: row.id,
    workEmail: row.work_email,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    organisationId,
    organisationName: org?.name ?? null,
    organisationType: org?.type ?? null,
    accessScope: row.access_scope,
    status: row.status,
    canPresentSimulations: row.can_present_simulations,
  };
}
