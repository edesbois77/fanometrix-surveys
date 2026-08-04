// ORG-004 BP-04 — pure helpers for Organisational Office (R06). Reuses the governed
// half-open Effective Applicability from BP-02/BP-03. The database (migrations 158-160)
// is authoritative; these mirror invariants and support the service layer + tests.
import { isValidEffectiveInterval, isApplicableOn, type EffectiveInterval } from "./bp02";
export { isValidEffectiveInterval, isApplicableOn };
export type { EffectiveInterval };

/** Do two half-open [from, to) intervals overlap? NULL bounds are open (unbounded).
 *  Adjacent intervals [.,D) and [D,.) do NOT overlap. */
export function intervalsOverlap(a: EffectiveInterval, b: EffectiveInterval): boolean {
  const aStartsBeforeBEnds = a.effectiveFrom === null || b.effectiveTo === null || a.effectiveFrom < b.effectiveTo;
  const bStartsBeforeAEnds = b.effectiveFrom === null || a.effectiveTo === null || b.effectiveFrom < a.effectiveTo;
  return aStartsBeforeBEnds && bStartsBeforeAEnds;
}

// R06 FR-010: an Organisational Office has EXACTLY ONE governing Organisation at each
// applicable structural-attachment point. Modelled as: an Office's attachment intervals must
// not overlap (at most one applicable attachment at any point => exactly one governing
// Organisation). This is the service/interpretation-layer invariant (migration 158 documents
// it is not a DB non-overlap constraint). The database still enforces that each attachment has
// exactly one governing_organisation_id (NOT NULL) and a valid half-open interval.
export type AttachmentInterval = EffectiveInterval & { id?: string };

export type Fr010Check = { ok: true } | { ok: false; reason: string; conflictsWith?: string };

/** Validate a candidate attachment interval against an Office's existing attachments so that
 *  no represented-world point has two applicable attachments (FR-010). `existing` excludes the
 *  row being edited (pass its id as `selfId`). */
export function validateAttachmentExclusivity(
  candidate: EffectiveInterval,
  existing: readonly AttachmentInterval[],
  selfId?: string
): Fr010Check {
  if (!isValidEffectiveInterval(candidate)) {
    return { ok: false, reason: "The end date must be after the start date (half-open [from, to); no same-day interval)." };
  }
  for (const e of existing) {
    if (selfId && e.id === selfId) continue;
    if (intervalsOverlap(candidate, e)) {
      return {
        ok: false,
        reason: "This attachment period overlaps another attachment for the same Office; an Office has exactly one governing Organisation at each applicable point (R06 FR-010).",
        conflictsWith: e.id,
      };
    }
  }
  return { ok: true };
}
