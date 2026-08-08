// ORG-005 · IW-0 — Central Authorisation Decision Seam.
//
// STATUS: IW-0 shadow foundation. This module re-expresses the CURRENT
// authorised production authorisation semantics (lib/auth-server.ts requireUser
// + lib/access.ts + per-handler guards) in ONE governed vocabulary, and adds
// two things the current path lacks:
//   1. an explicit ALLOW / REFUSE / INDETERMINATE distinction (closes the
//      mechanism side of UD-01 F064 — a dependency that cannot be evaluated is
//      reported as INDETERMINATE, distinct from an authoritative REFUSE, while
//      still failing closed at the caller, preserving F063/F065); and
//   2. recoverable decision PROVENANCE (mechanism for F022 / F066).
//
// It deliberately does NOT change behaviour:
//   • it MIRRORS current production semantics — including the admin super-ALLOW
//     (a governed CONFLICT, UD-01 F011, to be REPLACED at IW-5, not here); and
//   • it is NOT yet wired into any request handler (adoption is a later
//     workstream via the shadow→enforce mechanism below).
//
// Boundaries (IW-0): no Organisation model, no Active Context, no contextual
// roles, no Product/Capability/Entitlement, no scoped admin. Those are later
// workstreams and MUST NOT be implemented through this seam.

export type Decision = "ALLOW" | "REFUSE" | "INDETERMINATE";

export type Source =
  | "structural"      // session / principal / organisation status prerequisites
  | "role"            // role allowlist (current model)
  | "resource"        // resource authorisation (lib/access.ts visibility)
  | "explicit_deny"   // an explicit DENY-override (e.g. created_by_admin read-only)
  | "admin_override"  // DEPRECATED super-ALLOW source (removed at IW-5; retained in
                      // the union only so historical provenance stays typed)
  | "admin_authority" // IW-5 — scoped Platform Administration Authority (Q-27)
  | "exceptional_access" // IW-5 — Exceptional Resource Access, a separate path (Q-19)
  | "policy";         // policy-derived input (reserved for later formalisation)

/**
 * ORG-005 · IW-4 — a source's effect on a permission (Workshop §13). A source
 * may ALLOW, DENY, or have NO_EFFECT; these compose by the canonical Q-22 rule.
 */
export type Effect = "ALLOW" | "DENY" | "NO_EFFECT";

/** A single permission source's contribution to the composition (Q-20/Q-21). */
export interface PermissionContribution {
  source: Source;
  effect: Effect;
  reason: string;
}

export interface Provenance {
  /** The source that produced the final outcome. */
  decidedBy: Source;
  /** Operator-facing machine reason code (audience-separated: callers map this
   *  to a least-disclosure subject message per Q-35). */
  reason: string;
  /** Every source consulted en route to the decision. */
  contributing: Source[];
  /** ORG-005 IW-4 — source-attributed provenance (Q-35-D06/D07): every source
   *  that independently established ALLOW, so removing one source is explainable.
   *  Empty for a REFUSE/INDETERMINATE outcome. */
  allowSources?: Source[];
  /** ORG-005 IW-4 — every source contributing an explicit DENY (Q-35-D08). */
  denySources?: Source[];
}

export interface AuthzResult {
  decision: Decision;
  provenance: Provenance;
}

/**
 * Resolved authorisation inputs. These are produced by the EXISTING resolvers
 * (requireUser / lib/access.ts) and passed in — the seam performs no I/O and
 * holds no state (preserving the live-authority model F003 and the
 * no-competing-truth posture F049; the seam is a pure decision function).
 *
 * `"indeterminate"` marks a dependency that could not be evaluated (e.g. a DB
 * error), which is what enables the REFUSE-vs-INDETERMINATE distinction (F064)
 * without changing the fail-closed direction (F063).
 */
export interface DecisionInput {
  session: "present" | "absent";
  principalStatus: "active" | "inactive" | "indeterminate";
  role: string | null;
  isAdmin: boolean;
  orgStatus: "active" | "disabled" | "none" | "indeterminate";
  /** Handler role allowlist. `undefined`/`null` = any authenticated principal
   *  (mirrors requireUser(req) with no allowedRoles). */
  allowedRoles?: string[] | null;
  /** Resource authorisation outcome from lib/access.ts, or not_applicable when
   *  the operation is not resource-scoped. */
  resourceVisibility?: "visible" | "not_visible" | "not_applicable" | "indeterminate";
  /** An explicit DENY-override that revokes an otherwise-ALLOW (applies to
   *  everyone including admin from IW-5 — no super-ALLOW). */
  explicitDeny?: { denied: boolean; reason: string } | null;
  /** ORG-005 IW-5 — resolved scoped Platform Administration Authority for the
   *  administrative operation in scope (Q-27). Authorises the OPERATION only
   *  (administer ≠ possess); NOT a resource super-ALLOW. */
  adminAuthority?: { operation: string; granted: boolean } | null;
  /** ORG-005 IW-5 — resolved Exceptional Resource Access (Q-19): a separate,
   *  bounded, audited path. `granted` only when invoked + valid; it is an ALLOW
   *  with NO priority over DENY (not an override-DENY). */
  exceptionalAccess?: { granted: boolean; purpose?: string } | null;
}

const prov = (decidedBy: Source, reason: string, contributing: Source[]): Provenance => ({
  decidedBy,
  reason,
  contributing: [...contributing],
});

/**
 * Pure decision core. Mirrors CURRENT production semantics and adds
 * INDETERMINATE + provenance. Properties:
 *  - Default Refuse: absence of a sufficient ALLOW yields REFUSE.
 *  - Fail-closed distinction: an unevaluable dependency yields INDETERMINATE,
 *    which callers treat as deny — but it is reported distinctly from an
 *    authoritative REFUSE (F064 mechanism).
 *  - Explicit DENY precedence over an otherwise-ALLOW for EVERYONE incl. admin
 *    (Q-22) — the admin super-ALLOW is REMOVED at IW-5 (F011/F023).
 *  - Admin cross-cutting power comes from scoped admin authority (Q-27) and
 *    Exceptional Resource Access (Q-19), never an unconditional bypass.
 *  - No side effects: failures manufacture no state (F065).
 */
export function evaluate(input: DecisionInput): AuthzResult {
  const contributing: Source[] = ["structural"];

  // 1. INDETERMINATE — a prerequisite could not be evaluated. Distinguished
  //    from an authoritative REFUSE (F064). The caller still fails closed.
  if (
    input.principalStatus === "indeterminate" ||
    input.orgStatus === "indeterminate" ||
    input.resourceVisibility === "indeterminate"
  ) {
    return { decision: "INDETERMINATE", provenance: prov("structural", "dependency_unevaluable", contributing) };
  }

  // 2. Structural prerequisites (Default Refuse baseline). No positive signal
  //    here yields REFUSE.
  if (input.session === "absent") {
    return { decision: "REFUSE", provenance: prov("structural", "no_session", contributing) };
  }
  if (input.principalStatus !== "active") {
    // Blocks even an admin — mirrors auth-server.ts:75 (no admin exemption on
    // user status). This is F011's one current limit and a RETAIN property.
    return { decision: "REFUSE", provenance: prov("structural", "principal_inactive", contributing) };
  }
  if (!input.isAdmin && input.orgStatus === "disabled") {
    // Admins are exempt from org-disabled (a narrow STRUCTURAL availability
    // exemption so a disabled internal org can't lock every admin out — NOT the
    // resource super-ALLOW, which is removed at IW-5). Mirrors auth-server.ts:81.
    return { decision: "REFUSE", provenance: prov("structural", "organisation_disabled", contributing) };
  }

  // 3. Role allowlist — applies to everyone including admin (requireUser does
  //    not exempt admin from allowedRoles).
  contributing.push("role");
  if (input.allowedRoles && (input.role === null || !input.allowedRoles.includes(input.role))) {
    return { decision: "REFUSE", provenance: prov("role", "role_not_permitted", contributing) };
  }

  // 4. ORG-005 IW-4/IW-5 — ordinary permission COMPOSITION (Q-20/Q-21/Q-22).
  //    The admin super-ALLOW is REMOVED at IW-5 (F011/F023): `isAdmin` no longer
  //    contributes an unconditional ALLOW, so DENY precedence and resource
  //    authorisation apply to admins like everyone (SG-4 no-super-ALLOW).
  //    Admin cross-cutting power now comes from SCOPED admin authority (Q-27,
  //    authorises the operation only — administer≠possess) and, for the
  //    exceptional customer-resource path, Exceptional Resource Access (Q-19, a
  //    separate bounded/audited ALLOW with no priority over DENY).
  const contributions: PermissionContribution[] = [];
  if (input.adminAuthority?.granted) contributions.push({ source: "admin_authority", effect: "ALLOW", reason: "scoped_admin_authority" });
  if (input.exceptionalAccess?.granted) contributions.push({ source: "exceptional_access", effect: "ALLOW", reason: "exceptional_resource_access" });
  if (input.explicitDeny?.denied) contributions.push({ source: "explicit_deny", effect: "DENY", reason: input.explicitDeny.reason });
  if (input.resourceVisibility === "visible") {
    contributions.push({ source: "resource", effect: "ALLOW", reason: "prerequisites_satisfied" });
  } else if (input.resourceVisibility === "not_visible") {
    contributions.push({ source: "resource", effect: "NO_EFFECT", reason: "resource_default_refuse" });
  } else {
    // not_applicable — the satisfied role allowlist is the sufficient ALLOW.
    contributions.push({ source: "role", effect: "ALLOW", reason: "prerequisites_satisfied" });
  }

  return composeOrdinary(contributions, contributing);
}

/**
 * ORG-005 · IW-4/IW-5 — the ordinary permission COMPOSITION engine (Q-22,
 * Workshop §13). Pure and deterministic. Composition rule, applied AFTER
 * structural prerequisites (which are supreme and handled by the caller):
 *   1. Explicit DENY precedence — any DENY overrides ordinary ALLOW (Q-22).
 *      From IW-5 this applies to EVERYONE, including admin: there is NO super-
 *      ALLOW (F011/F023 removed). Scoped admin authority and Exceptional Resource
 *      Access are ordinary ALLOW sources with no priority over DENY.
 *   2. At least one sufficient ALLOW is required — with NO inherent priority
 *      among any sources (no super-ALLOW, no override-DENY, no weighting, no
 *      first-match beyond DENY precedence).
 *   3. Otherwise Default Refuse.
 * Provenance is source-attributed: `allowSources` lists every source that
 * independently established ALLOW (so revoking one is explainable, Q-35-D07).
 */
export function composeOrdinary(contributions: PermissionContribution[], base: Source[] = ["structural"]): AuthzResult {
  const contributing = [...base];
  for (const c of contributions) if (!contributing.includes(c.source)) contributing.push(c.source);
  const allowSources = contributions.filter(c => c.effect === "ALLOW").map(c => c.source);
  const denySources = contributions.filter(c => c.effect === "DENY").map(c => c.source);

  // 1. Explicit DENY precedence (Q-22) — applies to admin too (no super-ALLOW).
  const deny = contributions.find(c => c.effect === "DENY");
  if (deny) {
    return { decision: "REFUSE", provenance: { decidedBy: deny.source, reason: deny.reason, contributing, allowSources: [], denySources } };
  }
  // 2. Any sufficient ALLOW — no inherent source priority (Q-22).
  const allow = contributions.find(c => c.effect === "ALLOW");
  if (allow) {
    return { decision: "ALLOW", provenance: { decidedBy: allow.source, reason: allow.reason, contributing, allowSources, denySources: [] } };
  }
  // 4. Default Refuse (Q-22) — no sufficient ALLOW established.
  const noEffectResource = contributions.find(c => c.source === "resource" && c.effect === "NO_EFFECT");
  return {
    decision: "REFUSE",
    provenance: {
      decidedBy: noEffectResource ? "resource" : "structural",
      reason: noEffectResource ? noEffectResource.reason : "default_refuse",
      contributing,
      allowSources: [],
      denySources: [],
    },
  };
}

// ── Shadow → Enforce transition mechanism ────────────────────────────────────
// IW-0 ships this INERT (no handler calls it). Later workstreams adopt it per
// route: in "shadow" the legacy outcome stays authoritative and divergence is
// only recorded; in "enforce" the seam becomes authoritative. This is the
// no-authorisation-gap migration primitive from the frozen plan (§4).

export type EnforcementMode = "shadow" | "enforce";

export interface ShadowComparison {
  seam: Decision;
  legacyAllowed: boolean;
  divergent: boolean;
}

/** Compare a seam decision against the legacy path's effective allow/deny.
 *  Records divergence; never itself changes an outcome. */
export function compareToLegacy(result: AuthzResult, legacyAllowed: boolean): ShadowComparison {
  const seamAllowed = result.decision === "ALLOW";
  return { seam: result.decision, legacyAllowed, divergent: seamAllowed !== legacyAllowed };
}

/** The authoritative allow/deny for a given mode. In shadow mode the legacy
 *  outcome governs (seam is observational); in enforce mode the seam governs,
 *  and INDETERMINATE fails closed (deny). */
export function effectiveAllow(mode: EnforcementMode, result: AuthzResult, legacyAllowed: boolean): boolean {
  if (mode === "shadow") return legacyAllowed;
  return result.decision === "ALLOW"; // REFUSE and INDETERMINATE both deny (fail-closed)
}
