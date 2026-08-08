// ORG-005 · IW-5 — Exceptional Resource Access.
//
// Governed by Q-19 (Workshop §21/§24). A DISTINCT, deliberate exception to the
// ordinary Organisation Resource Entitlement boundary (F038 REPLACE): it permits
// an authenticated User to access a protected resource OUTSIDE ordinary
// entitlement for a defined controlled purpose. It is a SEPARATE authorisation
// path — NOT a high-priority ordinary ALLOW, and NOT an override-DENY mechanism
// (§24). It must be AUDITED (Q-29; now available via IW-7).
//
// GOVERNED REQUIREMENTS (all mandatory — Workshop §21):
//   • an actual authenticated Fanometrix User (the principal);
//   • explicit privileged eligibility;
//   • explicit invocation / activation (not ambient);
//   • an identifiable authorised purpose;
//   • a bounded resource / Resource Scope / operation;
//   • current validity (time-boxed);
//   • strong auditability.
// It creates NO User–Organisation Access, Product Access, Organisation Resource
// Entitlement, or customer Active Organisation Context (§21).
//
// RESERVED BOUNDARY. This is the structural authorisation model. The break-glass
// invocation/approval WORKFLOW MECHANICS (four-eyes, dual-control, request UX) are
// §38-reserved and are NOT built here — the model consumes an `invoked` fact and
// an `expiresAt`. Persistence + live wiring are a subsequent governed activation.

export interface ExceptionalAccessGrant {
  principalUserId: string;
  eligible: boolean;            // explicit privileged eligibility
  invoked: boolean;            // explicit invocation/activation (not ambient)
  purpose: string | null;      // identifiable authorised purpose
  resourceType: string;
  resourceId: string | null;   // null = a bounded Resource Scope (scopeId used)
  scopeId?: string | null;
  operation: string;
  expiresAt: number;           // epoch ms — current validity (time-boxed)
}

export interface ExceptionalAccessRequest {
  principalUserId: string;
  resourceType: string;
  resourceId: string | null;
  scopeId?: string | null;
  operation: string;
  now: number;                 // caller-supplied clock (pure)
}

export type ExceptionalDecision =
  | { granted: true; purpose: string }
  | { granted: false; reason: string };

/**
 * Q-19 — evaluate an Exceptional Resource Access grant against a request. Pure
 * and deterministic. Grants ONLY when EVERY governed requirement holds: same
 * principal, eligible, explicitly invoked, has a purpose, bounded match
 * (resource or scope + operation), and not expired. Any missing requirement →
 * refused. It is a separate path — the caller records a mandatory audit event
 * (IW-7) whenever this is evaluated/exercised, and never treats it as overriding
 * an explicit DENY.
 */
export function evaluateExceptionalAccess(grant: ExceptionalAccessGrant, req: ExceptionalAccessRequest): ExceptionalDecision {
  if (grant.principalUserId !== req.principalUserId) return { granted: false, reason: "principal_mismatch" };
  if (!grant.eligible) return { granted: false, reason: "not_eligible" };
  if (!grant.invoked) return { granted: false, reason: "not_invoked" };
  if (!grant.purpose) return { granted: false, reason: "no_purpose" };
  if (grant.operation !== req.operation) return { granted: false, reason: "operation_mismatch" };
  if (grant.resourceType !== req.resourceType) return { granted: false, reason: "resource_type_mismatch" };
  const boundMatch = grant.resourceId != null
    ? grant.resourceId === req.resourceId
    : grant.scopeId != null && grant.scopeId === req.scopeId;
  if (!boundMatch) return { granted: false, reason: "out_of_bounds" };
  if (req.now >= grant.expiresAt) return { granted: false, reason: "expired" };
  return { granted: true, purpose: grant.purpose };
}

/**
 * Exceptional Resource Access establishes NO durable context (§21). Always false
 * for each — a controlled, testable statement of the boundary.
 */
export const exceptionalAccessEstablishes = {
  userOrganisationAccess: () => false,
  productAccess: () => false,
  organisationResourceEntitlement: () => false,
  activeOrganisationContext: () => false,
};
