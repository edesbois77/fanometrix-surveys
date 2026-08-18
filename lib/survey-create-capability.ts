// ── Survey Studio Create — CONSUMER of the governed "Create commissioned
//    research" Q-10 capability. NOT a capability definition, NOT a policy. ─────
//
// The authoritative definition, resolution and V1 policy live in the governed
// ORG-005 Q-10 seam (lib/authz/product-access.ts: ProductCapability +
// resolveCapabilityAccess, enforced via hasCapability). Survey Studio consumes
// ONLY the resolved result and owns NO policy — it derives NOTHING from role,
// organisation type/classification, membership terminology, email/domain,
// Organisation ID or any other Organisation fact.
//
// This seam is deliberately OUTSIDE lib/authz/ so it can never be mistaken for a
// governed catalogue entry: it is a one-line delegation to the platform seam.
// Fail-closed when the principal cannot be resolved (no session yet), matching
// the seam's Default-Refuse posture.

import { hasCapability } from "@/lib/authz/product-access";
import type { UserRole } from "@/lib/auth";

/** The minimal principal shape hasCapability needs. Satisfied by both the
 *  server AuthedUser and the client SessionUser — Survey Studio passes whichever
 *  it holds; the governed seam decides. */
type CapabilityPrincipal = { role: UserRole; canPresentSimulations: boolean };

/**
 * Whether the current principal may use the broader COMMISSIONED / third-party
 * research purposes within Create. Delegates entirely to the governed Q-10
 * capability; returns false (fail-closed) when no principal is resolved.
 */
export function canCreateCommissionedResearch(principal: CapabilityPrincipal | null | undefined): boolean {
  if (!principal) return false;
  return hasCapability(principal, "create-commissioned-research");
}
