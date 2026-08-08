// ORG-005 · IW-6 — Resource Authorisation & Entitlement.
//
// Governed by Q-13–Q-19 / Q-26 (Workshop §15–20). Two DISTINCT responsibilities
// with a strict directional relationship:
//   • Organisation Resource Entitlement (Q-14) — durable Platform Authorisation
//     state that an ORGANISATION is authorised to access a specified protected
//     resource or governed Resource Scope. The entitlement SUBJECT is the
//     Organisation. It is NOT ownership / commissioning / custody / participation
//     / distribution / subscription (those are at most Policy Inputs — Q-12/Q-14).
//   • User Resource Authorisation (Q-15) — whether a User operating through the
//     Organisation may EXERCISE that entitlement. It may NARROW the Organisation's
//     entitlement but MUST NEVER expand it: no user ALLOW can reach a resource the
//     Organisation is not entitled to.
//
// GOVERNED INVARIANTS (all enforced + tested):
//   • per-asset granularity (Q-16): Study / Finding / Report / underlying Data are
//     the four independently-authorisable classes — NO others invented (§38).
//   • asset independence (Q-17): NO implicit inheritance across classes
//     (Report entitlement never implies Data; Study never implies its outputs).
//   • coverage-not-inheritance (Q-18): a Resource Scope covers exactly its
//     governed MEMBERS — never "everything contained" by hierarchy.
//   • no implicit propagation (Q-36-D06): rights never flow resource→related,
//     parent→child, org→related-org.
//   • operational involvement ≠ Data (Q-19/F027): participation/distribution/
//     ownership grants no Data entitlement.
//
// RESERVED (§38) — NOT built here: concrete resource identifiers, product-specific
// Resource Scope schemas, and the entitlement STORAGE representation beyond the
// governed generic entities. This module is the PURE resolution model; it consumes
// RESOLVED inputs (entitlement rows, a scope-membership decision) and computes no
// I/O. The persistence (migration) + product-specific scope resolution are the
// governed activation / reserved product-design respectively.

/** The four governed, independently-authorisable resource classes (Q-16). */
export type ResourceClass = "study" | "finding" | "report" | "data";

/** A reference to a specific protected resource. */
export interface ResourceRef {
  resourceClass: ResourceClass;
  resourceId: string;
}

/** A durable Organisation Resource Entitlement (Q-14) — a specific resource OR a
 *  governed Resource Scope, for one organisation and one class. */
export interface OrgEntitlement {
  organisationId: string;
  resourceClass: ResourceClass;
  resourceId?: string | null;   // a specific resource, OR…
  scopeId?: string | null;      // …a governed Resource Scope
  active?: boolean;
}

/** A User Resource Authorisation (Q-15) — may allow a specific resource/scope the
 *  user may exercise, or restrict (narrow) one; NEVER expands the org entitlement. */
export interface UserAuthorisation {
  userId: string;
  resourceClass: ResourceClass;
  resourceId?: string | null;
  scopeId?: string | null;
  effect: "allow" | "restrict";
  active?: boolean;
}

/**
 * Q-14 — is the ORGANISATION entitled to the resource? True iff a current
 * entitlement matches the SAME class (asset independence, Q-17) either directly
 * (same resourceId) or via a Resource Scope that COVERS the resource. Scope
 * coverage is decided by `scopeCovers` — a governed membership decision supplied
 * by the caller (coverage-not-inheritance, Q-18): the model never infers
 * membership from containment. Pure.
 */
export function organisationEntitled(
  entitlements: OrgEntitlement[],
  ref: ResourceRef,
  scopeCovers: (scopeId: string, ref: ResourceRef) => boolean = () => false,
): boolean {
  return entitlements.some(e =>
    e.active !== false &&
    e.resourceClass === ref.resourceClass &&           // per-class only (Q-16/Q-17)
    (
      (e.resourceId != null && e.resourceId === ref.resourceId) ||
      (e.scopeId != null && scopeCovers(e.scopeId, ref))
    ),
  );
}

/**
 * Q-15 — may the USER exercise access to the resource? The Organisation
 * entitlement is a PRECONDITION; user authorisation can only NARROW it. Rules:
 *   • not org-entitled → NEVER (a user ALLOW cannot expand beyond the org — the
 *     directional invariant);
 *   • an applicable user RESTRICT (same class + resource/scope) → denied (narrow);
 *   • org-wide exercise: permitted by default (inherits the org entitlement),
 *     unless restricted;
 *   • selected-access exercise: permitted only via an explicit user ALLOW for the
 *     resource/scope.
 * Pure and deterministic.
 */
export function userAuthorisedForResource(
  orgEntitled: boolean,
  ref: ResourceRef,
  opts: { accessScope: "organisation_wide" | "selected"; userAuthorisations: UserAuthorisation[]; scopeCovers?: (scopeId: string, ref: ResourceRef) => boolean },
): boolean {
  if (!orgEntitled) return false; // Q-15 directional invariant — never expands

  const covers = opts.scopeCovers ?? (() => false);
  const applies = (a: UserAuthorisation) =>
    a.active !== false && a.resourceClass === ref.resourceClass &&
    ((a.resourceId != null && a.resourceId === ref.resourceId) || (a.scopeId != null && covers(a.scopeId, ref)));

  if (opts.userAuthorisations.some(a => a.effect === "restrict" && applies(a))) return false; // narrow
  if (opts.accessScope === "organisation_wide") return true;                                  // inherits org entitlement
  return opts.userAuthorisations.some(a => a.effect === "allow" && applies(a));               // selected: explicit only
}

/**
 * The full ordinary resource decision (Q-13): Organisation Resource Entitlement
 * (required) then User Resource Authorisation (narrows). Pure.
 */
export function resolveResourceAccess(
  ref: ResourceRef,
  ctx: {
    orgEntitlements: OrgEntitlement[];
    accessScope: "organisation_wide" | "selected";
    userAuthorisations: UserAuthorisation[];
    scopeCovers?: (scopeId: string, ref: ResourceRef) => boolean;
  },
): boolean {
  const orgEntitled = organisationEntitled(ctx.orgEntitlements, ref, ctx.scopeCovers);
  return userAuthorisedForResource(orgEntitled, ref, { accessScope: ctx.accessScope, userAuthorisations: ctx.userAuthorisations, scopeCovers: ctx.scopeCovers });
}

/**
 * Q-14 / Q-19 / F027 — ownership, commissioning, participation and distribution
 * are NOT Organisation Resource Entitlement; they are at most governed Policy
 * Inputs. Always false: no operational/ownership fact is itself entitlement, and
 * none of them grants underlying Data. A governed policy MAY derive an entitlement
 * from such an input, but the derived entitlement is a separate, explicit
 * OrgEntitlement row — never this fact standing in for entitlement.
 */
export function ownershipIsEntitlement(): boolean {
  return false;
}
