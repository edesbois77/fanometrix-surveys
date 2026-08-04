// ORG-004 BP-02 — pure integrity helpers for Organisational Structure & Facts.
//
// These mirror, in application code, the invariants the BP-02 migrations enforce
// in Postgres (migrations 150–153): Unit constitutive-containment rules, Effective
// Applicability interval validity, eligible subject kinds, and primary-Name
// selection. Keeping them here gives the Phase B service layer a single tested
// source for the same rules the database guards, and lets the repo test suite
// cover the logic without a database. The database remains the authority; this is
// defence-in-depth and pre-flight validation, never a replacement for the SQL.

// The subject kinds a BP-02 fact (Name / Identifier / Classification) may attach to.
// 'organisational_office' was admitted additively in BP-04 (control determination F-3;
// migration 159 widened the DB subject_kind CHECKs) so an Office can be the subject of
// canonical facts (R06 FR-002). This mirrors that DB widening at the service layer.
export const ELIGIBLE_FACT_SUBJECT_KINDS = ["organisation", "organisation_unit", "organisational_office"] as const;
export type FactSubjectKind = (typeof ELIGIBLE_FACT_SUBJECT_KINDS)[number];

export function isEligibleFactSubjectKind(kind: string): kind is FactSubjectKind {
  return (ELIGIBLE_FACT_SUBJECT_KINDS as readonly string[]).includes(kind);
}

// ── Effective Applicability ─────────────────────────────────────────────────────
// Represented-world dates as a HALF-OPEN interval [effectiveFrom, effectiveTo):
// effectiveFrom is INCLUSIVE, effectiveTo is EXCLUSIVE. NULL = open bound. So a fact
// with effectiveTo = D is NOT applicable on D, and a replacement with effectiveFrom = D
// IS applicable on D — the transition boundary is deterministic and non-overlapping.
// Mirrors the *_effective_order CHECKs (effective_to > effective_from; no zero-length).
export type EffectiveInterval = { effectiveFrom: string | null; effectiveTo: string | null };

export function isValidEffectiveInterval({ effectiveFrom, effectiveTo }: EffectiveInterval): boolean {
  if (effectiveFrom === null || effectiveTo === null) return true; // open start or end
  return effectiveTo > effectiveFrom; // strict: no zero-length [d,d). ISO dates compare as strings
}

/** True when the half-open interval is applicable on date `on`: from-inclusive,
 *  to-exclusive. Open bounds are unbounded. */
export function isApplicableOn(interval: EffectiveInterval, on: string): boolean {
  if (!isValidEffectiveInterval(interval)) return false;
  if (interval.effectiveFrom !== null && on < interval.effectiveFrom) return false; // before inclusive start
  if (interval.effectiveTo !== null && on >= interval.effectiveTo) return false;    // on/after exclusive end
  return true;
}

// ── Organisation Unit constitutive containment ──────────────────────────────────
// Minimal shape of a Unit for structural checks.
export type UnitNode = { id: string; organisationId: string; parentUnitId: string | null };

/** Ancestry walk from a unit up to a root, following parent links in `byId`.
 *  Stops safely if a pre-existing cycle is encountered. */
export function ancestorsOf(byId: Map<string, UnitNode>, startParentId: string | null): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let cur = startParentId;
  while (cur !== null) {
    if (seen.has(cur)) break; // defensive: never loop on corrupt data
    seen.add(cur);
    chain.push(cur);
    cur = byId.get(cur)?.parentUnitId ?? null;
  }
  return chain;
}

export type ContainmentCheck = { ok: true } | { ok: false; reason: string };

/** Validate setting `unitId`'s parent to `newParentId` within `byId`, mirroring the
 *  organisation_units_containment_guard trigger. `unitOrganisationId` is the org the
 *  unit belongs to (unchanged by re-parenting). */
export function validateContainment(
  byId: Map<string, UnitNode>,
  unitId: string,
  unitOrganisationId: string,
  newParentId: string | null
): ContainmentCheck {
  if (newParentId === null) return { ok: true }; // root unit directly in the organisation
  if (newParentId === unitId) return { ok: false, reason: "a unit cannot be its own parent" };
  const parent = byId.get(newParentId);
  if (!parent) return { ok: false, reason: "parent unit does not exist" };
  if (parent.organisationId !== unitOrganisationId) {
    return { ok: false, reason: "parent unit belongs to a different organisation" };
  }
  if (ancestorsOf(byId, newParentId).includes(unitId)) {
    return { ok: false, reason: "circular unit containment" };
  }
  return { ok: true };
}

/** Cross-Organisation Unit movement is not defined in BP-02: an existing Unit's
 *  containing organisation is immutable. Mirrors the guard added to
 *  organisation_units_containment_guard (migration 150). */
export function validateUnitOrganisationImmutable(
  oldOrganisationId: string,
  newOrganisationId: string
): ContainmentCheck {
  return oldOrganisationId === newOrganisationId
    ? { ok: true }
    : { ok: false, reason: "a unit's organisation_id cannot be changed (cross-organisation movement is not defined in BP-02)" };
}

// ── Primary Name selection ──────────────────────────────────────────────────────
// The primary display name is the one projected to the legacy organisations.name /
// organisation_units.name. Mirrors the uq_organisation_names_one_primary invariant.
export type NameFact = { value: string; isPrimary: boolean; deletedAt: string | null };

export function selectPrimaryName(names: readonly NameFact[]): string | null {
  const primary = names.find((n) => n.isPrimary && n.deletedAt === null);
  return primary ? primary.value : null;
}
