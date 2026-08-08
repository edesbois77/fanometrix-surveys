// ORG-005 · IW-8 — Authorisation Explainability & Operational Diagnosis.
//
// Governed by Q-35 (Workshop). Closes the EVOLVE dispositions on F066 (source
// attribution / explanation-with-provenance) and F067 (denial causes distinct),
// and RETAINS F069 (diagnostic access protected — the CALLER gates the audience;
// this module only formats).
//
// CRITICAL BOUNDARY (D01/D22): explanation is NOT an authority source. This
// module READS an already-computed AuthzResult and DERIVES an explanation from
// its provenance — it computes no authorisation, reads no live state, and never
// reconstructs permission. No decision path imports it (asserted by test),
// mirroring the F048 audit boundary.
//
// AUDIENCE SEPARATION (D02/D23/D24/D25/D26/D27): User / administrator / security
// / operator are distinct consumption contexts. Least-disclosure applies — the
// User audience receives a coarse, existence-safe outcome ONLY (no source
// provenance, no reason detail, no resource existence — D10/D24). Detailed
// provenance and diagnostic classes are for authorised audiences.
//
// RESERVED (D28): this module defines explanation SEMANTICS only. It does NOT
// prescribe user-facing copy, reason-code schemas, diagnostic APIs, dashboards,
// tracing or telemetry — those are §38-reserved. Explanation ≠ audit (D19) and
// ≠ operational telemetry (D20).

import type { AuthzResult, Decision, Source } from "./decision";

export type Audience = "user" | "administrator" | "security" | "operator";

/** Material reason class (Q-35-D05) — a semantic classification, NOT a prescribed
 *  reason-code schema. Distinguishes the governing authorisation responsibility
 *  or failure class. */
export type ReasonClass =
  | "allowed"
  | "principal_or_context"    // structural prerequisite (session / principal / org context)
  | "role_or_capability"      // role / product / capability not permitted
  | "resource_not_available"  // resource Default Refuse (no sufficient ALLOW)
  | "explicit_restriction"    // an explicit DENY determined the outcome
  | "indeterminate";          // trustworthy evaluation could not be completed

/** Whether a REFUSE was caused by an explicit DENY or by Default Refuse (D08). */
export type RefuseCause = "explicit_deny" | "default_refuse";

/** A coarse, existence-safe outcome for the User audience (D24). */
export type UserOutcome = "allowed" | "not_available" | "cannot_verify";

export interface Explanation {
  audience: Audience;
  /** Full ALLOW/REFUSE/INDETERMINATE for authorised audiences; coarsened for User. */
  outcome: Decision | UserOutcome;
  /** Material reason class — omitted for the User audience (least-disclosure). */
  reasonClass?: ReasonClass;
  /** DENY vs Default Refuse — administrator+ only (D08). */
  refuseCause?: RefuseCause;
  /** Source provenance that established/blocked the outcome — administrator+ only
   *  (D06/D07). NEVER disclosed to the User audience. */
  sources?: Source[];
  /** The material INDETERMINATE condition — security/operator only (D14). */
  indeterminateCondition?: string;
}

/** Classify the material reason of a decision (D05). Pure; derived from provenance. */
export function classifyReason(result: AuthzResult): ReasonClass {
  if (result.decision === "ALLOW") return "allowed";
  if (result.decision === "INDETERMINATE") return "indeterminate";
  switch (result.provenance.decidedBy) {
    case "explicit_deny": return "explicit_restriction";
    case "structural": return "principal_or_context";
    case "role": return "role_or_capability";
    case "resource": return "resource_not_available";
    default: return "resource_not_available";
  }
}

/** DENY-vs-Default-Refuse for a REFUSE outcome (D08); undefined otherwise. */
export function refuseCause(result: AuthzResult): RefuseCause | undefined {
  if (result.decision !== "REFUSE") return undefined;
  return result.provenance.decidedBy === "explicit_deny" ? "explicit_deny" : "default_refuse";
}

/**
 * Audience-separated explanation (D02/D22/D23). Pure. Faithfully derived from the
 * result's provenance (D22 — no reconstructed assumptions), disclosing only what
 * the audience is entitled to (least-disclosure). The User audience receives a
 * coarse, existence-safe outcome with NO provenance (D10/D24).
 */
export function explainForAudience(result: AuthzResult, audience: Audience): Explanation {
  if (audience === "user") {
    const outcome: UserOutcome = result.decision === "ALLOW" ? "allowed"
      : result.decision === "INDETERMINATE" ? "cannot_verify" : "not_available";
    return { audience, outcome };
  }

  // administrator / security / operator — provenance-bearing, still scope-gated by
  // the CALLER (this module does not itself authorise the audience — F069/D03).
  const base: Explanation = {
    audience,
    outcome: result.decision,
    reasonClass: classifyReason(result),
    refuseCause: refuseCause(result),
    // Source-attributed provenance (D06/D07): every consulted source, plus the
    // ALLOW sources that independently established an ALLOW.
    sources: dedupe([...(result.provenance.contributing ?? []), ...(result.provenance.allowSources ?? [])]),
  };

  // Security/operator additionally get the INDETERMINATE material condition (D14).
  if ((audience === "security" || audience === "operator") && result.decision === "INDETERMINATE") {
    base.indeterminateCondition = result.provenance.reason;
  }
  return base;
}

function dedupe(sources: Source[]): Source[] {
  return [...new Set(sources)];
}
