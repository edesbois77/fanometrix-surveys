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
  organisations: { name: string; type: OrganisationType; status: "active" | "disabled" } | { name: string; type: OrganisationType; status: "active" | "disabled" }[] | null;
};

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
    .select("id, work_email, first_name, last_name, role, organisation_id, access_scope, status, can_present_simulations, organisations ( name, type, status )")
    .eq("id", session.sub)
    .single();

  const row = data as UserRow | null;
  if (error || !row) throw unauthorised("Unauthorised", 401);

  if (row.status !== "active") throw unauthorised("Account disabled", 403);

  const org = Array.isArray(row.organisations) ? row.organisations[0] : row.organisations;

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
    organisationId: row.organisation_id,
    organisationName: org?.name ?? null,
    organisationType: org?.type ?? null,
    accessScope: row.access_scope,
    status: row.status,
    canPresentSimulations: row.can_present_simulations,
  };
}
