// ORG-005 · IW-3 — Product Access & Product Capability Access as distinct layers.
//
// Governed by the frozen ORG-005 Architecture (Q-09 Product Access, Q-10 Product
// Capability Access) and the Implementation Programme Plan IW-3 (Concern 3).
// Closes the EVOLVE disposition on F013 (Product Access = role/route hard-coded)
// and F014 (Product/Capability conflation); underpins F020.
//
// THE MODEL (two DISTINCT authorisation layers — Workshop §9/§10, invariants
// 9/10/11):
//   • Product Access (Q-09): "May authenticated User U use Product P while
//     operating within Active Organisation Context O?" — User-in-Organisation
//     scoped, distinct from User–Organisation Access and from Capability/Resource.
//   • Product Capability Access (Q-10): "May this User, in this Organisation and
//     authorised Product, perform protected capability C?" — capabilities are
//     owned by their products but are valid, INDEPENDENT authorisation targets.
//     Capability refusal is NOT absence of Product Access (Q-35-D09).
//
// GRANT SOURCES (Q-20): direct Platform Authorisation state, Role-derived, or
// explicit governed policy — with NO inherent source priority (Q-22). During the
// strangler migration the initial grants are DERIVED 1:1 from the current
// implementation so permissions are preserved exactly (parity):
//   • Product Access is Role-derived, mirroring the current middleware
//     route-prefix gating (the F013 hard-coded gate, made an explicit layer).
//   • The one Capability gated today, "present-simulations", is a DIRECT
//     User-specific grant (users.can_present_simulations), mirrored exactly.
//
// STRANGLER SCOPE (what IW-3 is NOT). IW-3 does NOT build the composition engine
// (IW-4) and does NOT remove the admin super-ALLOW (IW-5) — the admin bypass is
// CARRIED THROUGH UNCHANGED here. The concrete Product/Capability CATALOGUE is a
// §38 reserved product-design matter; this module models the layers at the
// granularity the current implementation actually enforces (route-prefix access
// tiers + the present-simulations capability) and preserves them at parity. The
// mapping of these tiers onto the named governed Products (Survey Studio,
// Documents, Social Listening, Research Projects, …) and of the Survey Studio
// capability catalogue (Create/Request/Discover/Manage; Home is NOT a capability)
// is deferred implementation-design and is NOT invented here.
//
// This module is NOT wired to be authoritative: it resolves the two layers as a
// SHADOW observation alongside the legacy gate, exactly as the IW-0 seam runs in
// shadow. The enforce cut-over is a subsequent governed step (shadow → divergence
// review → enforce; Programme Plan §4). Pure functions are exhaustively tested;
// nav configuration is NEVER an input (SG-3: UI/nav is projection only).

import type { UserRole } from "@/lib/auth";

/**
 * Product Access domains — the access tiers the current implementation actually
 * enforces via middleware route-prefix gating (lib middleware.ts). Making these
 * an EXPLICIT layer is the F013 EVOLVE; the tiers mirror the legacy gate exactly.
 * "shared" = every authenticated role (no product-area restriction today).
 */
export type ProductAreaAccessTier =
  | "admin-only"            // ADMIN_ONLY_PREFIXES
  | "admin-and-publisher"   // ADMIN_AND_PUBLISHER_PREFIXES + BRAND_AGENCY_RESTRICTED
  | "shared";               // open to every authenticated role

/**
 * The protected Product Capabilities that actually exist as gates today. Only
 * "present-simulations" is currently a distinct capability gate. The governed
 * Survey Studio capability catalogue (create/request/discover/manage) is
 * referenced as the target but NOT enforced here — inventing gates that do not
 * exist would manufacture behaviour. Home is deliberately excluded (Workshop §10).
 */
export type ProductCapability = "present-simulations";

/** Role-derived Product Access grants — an exact mirror of the legacy middleware. */
const PRODUCT_AREA_ROLES: Record<ProductAreaAccessTier, ReadonlySet<UserRole>> = {
  "admin-only": new Set<UserRole>(["admin"]),
  "admin-and-publisher": new Set<UserRole>(["admin", "publisher"]),
  "shared": new Set<UserRole>(["admin", "brand", "agency", "publisher"]),
};

export interface ProductAccessInput {
  role: UserRole;
  tier: ProductAreaAccessTier;
}

export interface CapabilityAccessInput {
  role: UserRole;
  /** Direct User-specific grant (users.can_present_simulations). */
  canPresentSimulations: boolean;
  capability: ProductCapability;
}

/**
 * Q-09 — Product Access. Pure, deterministic. Resolves whether the User (by their
 * contextual Role) may use the given product-area tier. This is the Role-derived
 * source; it NEVER reads UI/nav configuration (SG-3) and is independent of the
 * Capability layer (Q-35-D09).
 */
export function resolveProductAccess({ role, tier }: ProductAccessInput): boolean {
  return PRODUCT_AREA_ROLES[tier].has(role);
}

/**
 * Q-10 — Product Capability Access. Pure, deterministic and INDEPENDENT of
 * Product Access. For "present-simulations" the grant is ALLOW when the User has
 * the direct grant OR is admin. The admin bypass is the CURRENT behaviour
 * (super-ALLOW), carried through UNCHANGED — its replacement by scoped authority
 * is IW-5, deliberately NOT performed here.
 */
export function resolveCapabilityAccess({ role, canPresentSimulations, capability }: CapabilityAccessInput): boolean {
  switch (capability) {
    case "present-simulations":
      return role === "admin" || canPresentSimulations;
  }
}

// ── Strangler parity oracles ─────────────────────────────────────────────────
// Independent re-encodings of the CURRENT gate (middleware route-prefix rules and
// the inline `role === "admin" || canPresentSimulations` capability check), used
// to prove — by exhaustive enumeration in the tests — that the model above yields
// the identical allow/deny outcome as the legacy implementation for every input.

/** Legacy middleware outcome for a product-area tier (mirrors middleware.ts). */
export function legacyProductAreaAllows(role: UserRole, tier: ProductAreaAccessTier): boolean {
  switch (tier) {
    // ADMIN_ONLY_PREFIXES: blocked unless role === "admin".
    case "admin-only":
      return role === "admin";
    // ADMIN_AND_PUBLISHER_PREFIXES: admin|publisher; brand/agency blocked. The
    // BRAND_AGENCY_RESTRICTED set resolves to the same allow-set (admin|publisher).
    case "admin-and-publisher":
      return role === "admin" || role === "publisher";
    // No restrictive prefix matched → every authenticated role passes.
    case "shared":
      return true;
  }
}

/** Legacy inline capability outcome (mirrors the ~13 `session.canPresentSimulations` sites). */
export function legacyCapabilityAllows(role: UserRole, canPresentSimulations: boolean, capability: ProductCapability): boolean {
  switch (capability) {
    case "present-simulations":
      return role === "admin" || canPresentSimulations;
  }
}

/** Parity of the Product Access layer vs the legacy gate for one input. */
export function productAccessParity(input: ProductAccessInput): { parity: boolean; detail: string } {
  const model = resolveProductAccess(input);
  const legacy = legacyProductAreaAllows(input.role, input.tier);
  return model === legacy
    ? { parity: true, detail: "product_access_matches_legacy" }
    : { parity: false, detail: `product_access_divergence(${input.role},${input.tier})` };
}

/** Parity of the Capability layer vs the legacy gate for one input. */
export function capabilityAccessParity(input: CapabilityAccessInput): { parity: boolean; detail: string } {
  const model = resolveCapabilityAccess(input);
  const legacy = legacyCapabilityAllows(input.role, input.canPresentSimulations, input.capability);
  return model === legacy
    ? { parity: true, detail: "capability_access_matches_legacy" }
    : { parity: false, detail: `capability_access_divergence(${input.capability})` };
}
