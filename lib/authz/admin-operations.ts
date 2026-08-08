// ORG-005 · G-2 — the concrete privileged-operation catalogue + operator resource
// domains required to activate the accepted IW-5 model (admin-authority.ts) and the
// approved Platform-Operator standing entitlement (§4.2 Option a).
//
// Two DELIBERATELY SEPARATE axes (administer ≠ possess):
//   • PRIVILEGED_OPERATIONS — security-sensitive administrative OPERATIONS,
//     governed by Scoped Platform Administration Authority (hasAdminAuthority).
//     Holding one grants NO resource content access.
//   • OPERATOR_RESOURCE_DOMAINS — routine resource ACCESS domains, governed by the
//     Platform-Operator standing entitlement. Holding one grants NO administrative
//     operation authority.

/** The concrete catalogue of privileged administrative operations (Q-27). Each is
 *  a bounded operation an authority may permit within a scope — never a super-ALLOW. */
export const PRIVILEGED_OPERATIONS = [
  "user.manage",
  "organisation.manage",
  "research_project.manage",
  "campaign.manage",
  "campaign_group.manage",
  "survey.manage",
  "reporting.manage",
  "library.manage",
  "analysis.manage",
] as const;
export type PrivilegedOperation = (typeof PRIVILEGED_OPERATIONS)[number];

/** The resource domains a Platform-Operator standing entitlement may cover — the
 *  routine resource access a platform operator needs. Explicit + per-domain so the
 *  entitlement is granular and revocable, never an undifferentiated bypass. */
export const OPERATOR_RESOURCE_DOMAINS = [
  "study",
  "data",
  "finding",
  "report",
  "campaign",
  "campaign_group",
  "insight",
] as const;
export type OperatorResourceDomain = (typeof OPERATOR_RESOURCE_DOMAINS)[number];

/** Map a lib/access ResourceType (+ the Data pseudo-type) to its operator domain. */
export function domainForResourceType(
  resourceType: "research_project" | "campaign" | "campaign_group" | "insight" | "data",
): OperatorResourceDomain {
  return resourceType === "research_project" ? "study" : resourceType;
}
