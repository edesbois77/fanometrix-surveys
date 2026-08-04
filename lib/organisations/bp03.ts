// ORG-004 BP-03 — pure helpers for Organisational Identity (R03/IC-05) and
// Relationships (R05/IC-07). Like bp02.ts, these mirror invariants the BP-03
// migrations enforce in Postgres, give the service layer one tested source, and let
// the suite cover the logic without a database. The database remains authoritative.
//
// Effective Applicability reuses the governed half-open [from, to) convention from
// BP-02 (IC-06) unchanged — imported below, not redefined.
import { isValidEffectiveInterval, isApplicableOn, type EffectiveInterval } from "./bp02";
export { isValidEffectiveInterval, isApplicableOn };
export type { EffectiveInterval };

// ── Relationship participant subject kinds (R05 FR-008..011) ─────────────────────
// Eligible subjects for a Relationship participant. Organisation and Organisation Unit
// came with BP-03; 'organisational_office' was admitted additively in BP-04 (control
// determination F-3; migration 159 widened the participants subject_kind CHECK) so an
// Office can participate in ordinary Relationships (R06 FR-011/FR-017). This mirrors that
// DB widening at the service layer. (Actual office-holding instances remain blocked by the
// migration-160 guard until the external holder-subject dependency is resolved.)
export const RELATIONSHIP_PARTICIPANT_KINDS = ["organisation", "organisation_unit", "organisational_office"] as const;
export type RelationshipParticipantKind = (typeof RELATIONSHIP_PARTICIPANT_KINDS)[number];

export function isRelationshipParticipantKind(kind: string): kind is RelationshipParticipantKind {
  return (RELATIONSHIP_PARTICIPANT_KINDS as readonly string[]).includes(kind);
}

// ── Temporal state derived from Effective Applicability (R03 FR-020, R05 FR-024) ──
// current/historical/future are DERIVED at an interpretation point from the fact's own
// half-open applicability — never stored as a lifecycle/status. Half-open: a fact with
// effective_to = D is historical on D; effective_from = D is current on D.
export type TemporalState = "current" | "historical" | "future";

export function deriveTemporalState(interval: EffectiveInterval, on: string): TemporalState {
  if (interval.effectiveFrom !== null && on < interval.effectiveFrom) return "future";
  if (interval.effectiveTo !== null && on >= interval.effectiveTo) return "historical";
  return "current";
}

// ── Relationship participant structure (R05 FR-001/013) ─────────────────────────
export type ParticipantInput = { subjectId: string; subjectKind: string; role?: string | null };

export type ParticipantCheck = { ok: true } | { ok: false; reason: string };

/** A canonical Relationship is an association among participants: at least two, each an
 *  eligible existing subject, with no exact-duplicate (subject+kind+role) participant.
 *  Directed/symmetric/role structure is expressed through participant roles (FR-012/013/030),
 *  not a separate direction flag. The DB composite FK still authoritatively checks the
 *  subject exists; this is pre-flight structural validation. */
export function validateParticipants(participants: readonly ParticipantInput[]): ParticipantCheck {
  if (participants.length < 2) {
    return { ok: false, reason: "a relationship must have at least two participants" };
  }
  for (const p of participants) {
    if (!p.subjectId) return { ok: false, reason: "each participant needs a subject" };
    if (!isRelationshipParticipantKind(p.subjectKind)) {
      return { ok: false, reason: `participant subject kind '${p.subjectKind}' is not eligible in BP-03 (organisation or organisation_unit only)` };
    }
  }
  const seen = new Set<string>();
  for (const p of participants) {
    const key = `${p.subjectId}|${p.subjectKind}|${p.role ?? ""}`;
    if (seen.has(key)) return { ok: false, reason: "duplicate participant (same subject and role) in one relationship" };
    seen.add(key);
  }
  return { ok: true };
}

// Relationship type directionality (R05 FR-013). A type declares whether its meaning is
// directed (participants take distinct roles/capacities, e.g. predecessor→successor,
// member→body) or symmetric (participants are interchangeable).
export const RELATIONSHIP_DIRECTIONALITY = ["directed", "symmetric"] as const;
export type RelationshipDirectionality = (typeof RELATIONSHIP_DIRECTIONALITY)[number];

export function isRelationshipDirectionality(d: string): d is RelationshipDirectionality {
  return (RELATIONSHIP_DIRECTIONALITY as readonly string[]).includes(d);
}
