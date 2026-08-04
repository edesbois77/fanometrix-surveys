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

// Holder actor kinds admissible NOW: the IC-01 organisational subjects that are
// already-established, referenceable actors (R07 FR-002; AMEND-03 §11). Externally-governed
// actors (Person, etc.) are the PRESERVED holder dependency - not admissible until that
// architecture exists (R07-BE-01; BP-04 external holder-subject dependency). R07 does NOT
// determine holder eligibility (BE-01) and does NOT create Person/Actor architecture.
export const AUTHORITY_HOLDER_KINDS = ["organisation", "organisation_unit", "organisational_office"] as const;
export type AuthorityHolderKind = (typeof AUTHORITY_HOLDER_KINDS)[number];
export function isAuthorityHolderKind(kind: string): kind is AuthorityHolderKind {
  return (AUTHORITY_HOLDER_KINDS as readonly string[]).includes(kind);
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
