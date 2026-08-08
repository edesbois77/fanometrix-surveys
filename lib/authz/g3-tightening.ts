// ORG-005 · G-3 (shadow) — divergence classification for the G-3 dual-run.
//
// When the new resource model becomes authoritative, some current access ceases.
// The G-3 gate requires ZERO *unexplained* divergence: every ALLOW→DENY must be a
// GOVERNED intended tightening (accepted by governance), and there must be NO
// DENY→ALLOW (expansion). This module encodes the accepted GD-4 disposition so the
// dual-run can classify each divergence deterministically and prove the gate.
//
// GD-4 accepted disposition (governance, 2026-08-08): current campaign-level Data
// exposure to a monitoring publisher whose Study it does NOT legitimately
// participate in is OPERATIONAL campaign-monitoring (§9-E) — NOT Data entitlement
// (§9-B/F027). Its cessation under G-3 is a governed INTENDED TIGHTENING, not a
// loss to preserve. No additional Data ORE and no alternative Data-access path is
// authorised for these.

export type DivergenceClass = "preserved" | "governed_tightening" | "unexplained" | "expansion";

/** Facts about a single (principal, campaign-Data) relationship under comparison. */
export interface DataDivergenceFacts {
  legacyAllow: boolean;              // did lib/access.ts grant Data (via campaign visibility)?
  newAllow: boolean;                 // does the new per-Study Data model grant it?
  /** Is the campaign's containing Study one the organisation legitimately
   *  participates in at STUDY level (brand/agency/publisher on a non-admin,
   *  non-deleted Study)? Only such Studies carry a governed Data entitlement. */
  orgIsStudyParticipant: boolean;
  studyCreatedByAdmin: boolean;      // admin-created Study → org-wide study access excluded by design
  studyDeleted: boolean;             // deleted Study
}

/**
 * Classify one Data divergence against the accepted GD-4 disposition. Pure.
 *
 *   • no change                                   → preserved
 *   • DENY→ALLOW                                  → expansion   (gate FAILS)
 *   • ALLOW→DENY, campaign-monitoring of a Study
 *     the org does NOT study-participate in
 *     (admin-created / deleted / non-participant) → governed_tightening (accepted)
 *   • ALLOW→DENY on a Study the org DOES
 *     study-participate in                        → unexplained (gate FAILS — a real loss)
 */
export function classifyDataDivergence(f: DataDivergenceFacts): DivergenceClass {
  if (f.legacyAllow === f.newAllow) return "preserved";
  if (!f.legacyAllow && f.newAllow) return "expansion";
  // legacyAllow && !newAllow — an ALLOW→DENY tightening.
  const isMonitoringOnly = !f.orgIsStudyParticipant || f.studyCreatedByAdmin || f.studyDeleted;
  return isMonitoringOnly ? "governed_tightening" : "unexplained";
}

/** The gate: a set of classified divergences passes iff there is NO expansion and
 *  NO unexplained divergence (governed_tightening and preserved are both fine). */
export function dualRunGatePasses(classes: DivergenceClass[]): boolean {
  return !classes.some((c) => c === "expansion" || c === "unexplained");
}
