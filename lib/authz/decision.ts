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
  | "admin_override"  // current admin super-ALLOW (F011 — preserved at IW-0)
  | "policy";         // policy-derived input (reserved for later formalisation)

export interface Provenance {
  /** The source that produced the final outcome. */
  decidedBy: Source;
  /** Operator-facing machine reason code (audience-separated: callers map this
   *  to a least-disclosure subject message per Q-35). */
  reason: string;
  /** Every source consulted en route to the decision. */
  contributing: Source[];
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
  /** An explicit DENY-override that revokes an otherwise-ALLOW for non-admins
   *  (e.g. the "Set up by Fanometrix" created_by_admin read-only rule). */
  explicitDeny?: { denied: boolean; reason: string } | null;
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
 *  - Explicit DENY precedence over an otherwise-ALLOW for non-admins (Q-22).
 *  - Admin super-ALLOW is PRESERVED (current F011 behaviour) — admin bypasses
 *    resource + explicit DENY, but NOT the inactive-principal block.
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
    // Admins are exempt from org-disabled — mirrors auth-server.ts:81.
    return { decision: "REFUSE", provenance: prov("structural", "organisation_disabled", contributing) };
  }

  // 3. Role allowlist — applies to everyone including admin (requireUser does
  //    not exempt admin from allowedRoles).
  contributing.push("role");
  if (input.allowedRoles && (input.role === null || !input.allowedRoles.includes(input.role))) {
    return { decision: "REFUSE", provenance: prov("role", "role_not_permitted", contributing) };
  }

  // 4. Admin super-ALLOW — CURRENT semantics (F011). Preserved at IW-0; to be
  //    REPLACED by scoped Platform Administration Authority at IW-5.
  if (input.isAdmin) {
    contributing.push("admin_override");
    return { decision: "ALLOW", provenance: prov("admin_override", "admin_bypass", contributing) };
  }

  // 5. Explicit DENY precedence — overrides an otherwise-ALLOW for non-admins.
  if (input.explicitDeny?.denied) {
    contributing.push("explicit_deny");
    return { decision: "REFUSE", provenance: prov("explicit_deny", input.explicitDeny.reason, contributing) };
  }

  // 6. Resource authorisation — Default Refuse when the resource is not visible.
  if (input.resourceVisibility === "not_visible") {
    contributing.push("resource");
    return { decision: "REFUSE", provenance: prov("resource", "resource_default_refuse", contributing) };
  }
  if (input.resourceVisibility === "visible") contributing.push("resource");

  // 7. All prerequisites satisfied, no DENY → ALLOW.
  return {
    decision: "ALLOW",
    provenance: prov(input.resourceVisibility === "visible" ? "resource" : "role", "prerequisites_satisfied", contributing),
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
