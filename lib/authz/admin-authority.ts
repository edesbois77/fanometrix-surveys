// ORG-005 · IW-5 — Scoped Platform Administration Authority.
//
// Governed by Q-27/Q-23/Q-25 (Workshop §22–24). REPLACES the global super-admin
// (F011/F023/F035/F036): a Fanometrix User may perform specified security-
// sensitive platform-administrative operations WITHIN AN EXPLICITLY AUTHORISED
// SCOPE — never an unconditional bypass. Pure, structural model.
//
// GOVERNING PROPERTIES (enforced by this model):
//   • administer ≠ possess (Q-27) — authority to administer a permission/resource
//     is NOT possession of it. hasAdminAuthority answers "may U administer
//     operation X in scope S?", NOT "may U access resource R?". Resource access
//     is ordinary Resource Authorisation (IW-6) or Exceptional Resource Access.
//   • no self-elevation (Q-25) — an administrator cannot use their authority to
//     grant/broaden their OWN authority or role.
//   • scoped — every authority is bounded (organisation / operation / …); nothing
//     is global-by-default. Internal status alone confers nothing (§23).
//
// STRANGLER / RESERVED BOUNDARY. This is the structural model; the CONCRETE
// privileged-authority catalogue and the assignable-scope administration
// mechanics are §38-reserved product-design and are NOT invented here. The seam
// consumes a resolved `granted` decision; the persistent grant store + live
// cut-over (removing the lib/access.ts super-ALLOW) are a subsequent governed
// activation (DDL + seam→enforce), NOT performed here. The IW-0 seam stays shadow.

/** A bounded administration authority grant. Scope is deliberately generic. */
export interface AdminAuthorityGrant {
  /** The administrative operation this authority permits (e.g. "user.manage"). */
  operation: string;
  /** Bounding scope; empty object = the operation's own default scope, never global. */
  scope?: { organisationId?: string | null };
  /** Current validity — an expired/revoked authority does not apply (Q-33). */
  active?: boolean;
}

export interface AdminAuthorityRequest {
  operation: string;
  organisationId?: string | null;
}

/**
 * Q-27 — does the principal hold a CURRENT, SCOPE-MATCHING authority to perform
 * the requested administrative operation? Pure and deterministic. NEVER a
 * super-ALLOW: it authorises the OPERATION only, within scope; it grants no
 * resource content access (administer ≠ possess).
 */
export function hasAdminAuthority(grants: AdminAuthorityGrant[], req: AdminAuthorityRequest): boolean {
  return grants.some(g =>
    g.active !== false &&
    g.operation === req.operation &&
    scopeMatches(g.scope, req.organisationId ?? null),
  );
}

function scopeMatches(scope: AdminAuthorityGrant["scope"], organisationId: string | null): boolean {
  // No org bound on the grant → applies within the operation's own scope (still
  // not "all resources" — administer≠possess). An org-bound grant must match.
  if (!scope || scope.organisationId == null) return true;
  return scope.organisationId === organisationId;
}

/**
 * Q-25 — no self-elevation. An administrative operation that targets the actor's
 * OWN authority/role (grant self, elevate self) must be refused regardless of any
 * held authority. Pure guard used by administration operations.
 */
export function isSelfElevation(actorUserId: string, target: { userId: string; elevatesAuthorityOrRole: boolean }): boolean {
  return target.userId === actorUserId && target.elevatesAuthorityOrRole;
}

/**
 * administer ≠ possess (Q-27). Explicit, testable statement that holding
 * administration authority over a resource class does NOT itself authorise
 * accessing a resource's content — that is ordinary Resource Authorisation or,
 * exceptionally, Exceptional Resource Access. Always false: admin authority is
 * never resource possession.
 */
export function adminAuthorityGrantsResourceAccess(): boolean {
  return false;
}
