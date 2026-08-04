// ORG-004 BP-05 - pure helpers for Organisational Authority (R07). Authority is a
// NON-FIRST-CLASS canonical fact: an eligible actor (holder) empowered to act for an
// Organisation (principal) within a scope, subject to material constraints, with
// Authority-owned Effective Applicability, optionally referencing established bases.
// Reuses the governed half-open applicability from BP-02/BP-03. The database
// (migrations 161-162) is authoritative; these support the service layer + tests.
import { isValidEffectiveInterval, isApplicableOn, type EffectiveInterval } from "./bp02";
import { deriveTemporalState, type TemporalState } from "./bp03";
export { isValidEffectiveInterval, isApplicableOn, deriveTemporalState };
export type { EffectiveInterval, TemporalState };

// Holder eligibility is an EXTERNALLY GOVERNED dependency (R07 FR-002; AMEND-03 §11; BE-01):
// R07 must NOT determine whether an actor is eligible, and existing IC-01 subjecthood is NOT
// evidence of holder eligibility (control determination J-1). There is therefore NO statically
// admissible holder kind in code. Which holder subject kinds are eligible is governed by the
// database registry `authority_eligible_holder_kinds`, which is CURRENTLY EMPTY - so no holder
// is eligible and actual Authority instances are unavailable (preserved dependency, exactly as
// BP-04 office-holding). Eligible holder kinds are admitted additively (by admitting a kind under
// an architecture that establishes its eligibility) without redesigning Authority.
export function isAdmittedHolderKind(kind: string, admittedKinds: readonly string[]): boolean {
  return admittedKinds.includes(kind);
}
/** With no admitted eligible holder kinds, Authority instances are unavailable. */
export function anyHolderKindAdmitted(admittedKinds: readonly string[]): boolean {
  return admittedKinds.length > 0;
}

// Material constraint kinds (AMEND-03 §3; R07 FR-011).
export const AUTHORITY_CONSTRAINT_TYPES = ["threshold", "jurisdiction", "condition", "limit"] as const;
export type AuthorityConstraintType = (typeof AUTHORITY_CONSTRAINT_TYPES)[number];
export function isAuthorityConstraintType(t: string): t is AuthorityConstraintType {
  return (AUTHORITY_CONSTRAINT_TYPES as readonly string[]).includes(t);
}

// Basis reference kinds (R07 FR-015/016/017). Internal bases are consumed by reference
// (R05 Relationship / R06 Office); external bases are reference-only (R07 must not determine
// their semantics/validity - BE-02..05).
export const AUTHORITY_BASIS_KINDS = [
  "office", "relationship",                                                   // internal (R06 / R05), reference-only
  "delegation", "agency", "appointment", "contract", "statute", "governing_rule", "other", // external, reference-only
] as const;
export type AuthorityBasisKind = (typeof AUTHORITY_BASIS_KINDS)[number];
export const INTERNAL_BASIS_KINDS = ["office", "relationship"] as const;
export function isAuthorityBasisKind(k: string): k is AuthorityBasisKind {
  return (AUTHORITY_BASIS_KINDS as readonly string[]).includes(k);
}
export function isInternalBasisKind(k: string): boolean {
  return (INTERNAL_BASIS_KINDS as readonly string[]).includes(k);
}

// ── FA-B: constraint-dimension determination (R07 FR-011/012/013) ────────────────
// Per material constraint, a deterministic evaluation is 'satisfied', 'failed', or
// 'undetermined' (insufficient/disputed information - NOT a deterministic failure, FR-012).
export type ConstraintEvaluation = "satisfied" | "failed" | "undetermined";
// The constraint dimension of an Authority determination:
//  - 'satisfied'     : every material constraint is satisfied  -> permits the consequence
//  - 'failed'        : some constraint is deterministically failed -> prevents applicability (FR-012)
//  - 'indeterminate' : no failure, but some constraint is undetermined -> cannot deterministically conclude
export type ConstraintDimension = "satisfied" | "failed" | "indeterminate";
export function evaluateConstraintDimension(evals: readonly ConstraintEvaluation[]): ConstraintDimension {
  if (evals.some((e) => e === "failed")) return "failed";              // deterministic failure prevents (FR-012)
  if (evals.some((e) => e === "undetermined")) return "indeterminate"; // insufficient info != failure (FR-012)
  return "satisfied";                                                   // all satisfied permits
}

// ── FA-D: temporal applicability of an Authority fact (R07 FR-019/020) ───────────
// Authority owns its own applicability (FR-018) and is never inherited from related facts.
// current/historical/future are DERIVED (FR-020), never stored as Authority states.
export function authorityTemporalState(interval: EffectiveInterval, on: string): TemporalState {
  return deriveTemporalState(interval, on);
}
export function authorityAppliesOn(interval: EffectiveInterval, on: string): boolean {
  return isApplicableOn(interval, on);
}

// ── FR-013: compose a holder-empowered-for-a-target determination ────────────────
// Deterministic composition over an Authority fact's OWN applicability (FA-D), whether the
// target falls within the established scope (FA-B scope; R07 authors NO universal scope ontology,
// so `withinScope` is supplied by the caller's deterministic in/out interpretation), and the
// material-constraint dimension (FA-B constraints). A determination EMPOWERS only when the
// Authority applies at the point, the target is within scope, AND every material constraint is
// satisfied. Insufficient information is never treated as a failure (FR-010/012): scope-unknown
// or an indeterminate constraint yields 'indeterminate', not 'not_empowered'.
export type AuthorityDetermination = "empowered" | "not_empowered" | "indeterminate";
export function composeAuthorityDetermination(input: {
  interval: EffectiveInterval;
  on: string;
  withinScope: boolean | "unknown";
  constraintEvaluations: readonly ConstraintEvaluation[];
}): { determination: AuthorityDetermination; temporal: TemporalState; constraintDimension: ConstraintDimension } {
  const temporal = deriveTemporalState(input.interval, input.on);
  const constraintDimension = evaluateConstraintDimension(input.constraintEvaluations);
  const applies = temporal === "current";
  let determination: AuthorityDetermination;
  if (!applies || input.withinScope === false || constraintDimension === "failed") {
    determination = "not_empowered";                 // a deterministic exclusion prevents (FR-012)
  } else if (input.withinScope === "unknown" || constraintDimension === "indeterminate") {
    determination = "indeterminate";                 // insufficient info != outside-scope/failure (FR-010/012)
  } else {
    determination = "empowered";                     // applies + within scope + all constraints satisfied
  }
  return { determination, temporal, constraintDimension };
}
