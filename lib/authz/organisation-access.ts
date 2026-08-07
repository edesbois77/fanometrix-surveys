// ORG-005 · IW-1 — User–Organisation Access & Active Organisation Context.
//
// Governed by the frozen Implementation Programme Plan v1.0 (IW-1). This is the
// strangler foundation: the multi-organisation model runs ALONGSIDE the scalar
// users.organisation_id (retained as authoritative fallback until IW-11). The
// pure resolution functions below are the security-critical core (Q-05–Q-08)
// and are exhaustively unit-tested; the DB reader is best-effort so deploying
// before/after the migration is safe.
//
// IW-1 boundary: identity (users.id) is independent of Organisation context;
// this module resolves CONTEXT only and grants no product/capability/resource
// permission (those are IW-2/3/6). It is NOT wired to be authoritative here —
// adoption/cut-over is a governed post-migration step.

import { supabaseAdmin } from "@/lib/supabase-admin";

/** Active user↔org access facts (Q-03). Zero, one or many (Q-05). */
export type OrganisationAccessSet = string[]; // active organisation ids

export type ContextStatus =
  | "resolved"            // exactly one authoritative Active Organisation Context
  | "selection_required"  // multiple authorised orgs, none validly remembered → user must choose
  | "no_access"           // zero authorised orgs → no context
  | "switch_denied";      // an explicit switch targeted an org the user is not authorised for

export interface ActiveContextResolution {
  activeOrganisationId: string | null;
  status: ContextStatus;
  reason: string;
}

/**
 * Resolve the single authoritative Active Organisation Context (Q-06). NEVER
 * unions permissions across organisations — it returns exactly one org id or
 * null. Rules:
 *  - zero access → no_access (null).
 *  - explicit switch (`requested` set): permitted ONLY if the target is in the
 *    live access set (Q-08); a denied switch grants no context (previous-org
 *    permission must not carry).
 *  - otherwise: a remembered/preferred context is used ONLY if it is still in
 *    the live access set (Q-07 — convenience state that must remain authorised);
 *    else a single authorised org is auto-selected; else selection is required.
 *
 * Pure and deterministic.
 */
export function resolveActiveContext(
  access: OrganisationAccessSet,
  remembered: string | null,
  requested?: string,
): ActiveContextResolution {
  const authorised = new Set(access);

  if (authorised.size === 0) {
    return { activeOrganisationId: null, status: "no_access", reason: "no_organisation_access" };
  }

  if (requested !== undefined) {
    if (authorised.has(requested)) {
      return { activeOrganisationId: requested, status: "resolved", reason: "switch_authorised" };
    }
    // Q-08: the target is not authorised — the switch fails and grants no
    // context. The caller keeps the user's prior context (does not apply it).
    return { activeOrganisationId: null, status: "switch_denied", reason: "switch_target_not_authorised" };
  }

  if (remembered !== null && authorised.has(remembered)) {
    return { activeOrganisationId: remembered, status: "resolved", reason: "remembered_still_authorised" };
  }

  if (authorised.size === 1) {
    return { activeOrganisationId: access[0], status: "resolved", reason: "single_organisation" };
  }

  // Multiple authorised orgs and no valid remembered context → must select.
  return { activeOrganisationId: null, status: "selection_required", reason: "multiple_organisations_no_valid_preference" };
}

/** Whether a user may switch to `target` (Q-08). */
export function canSwitchTo(access: OrganisationAccessSet, target: string): boolean {
  return access.includes(target);
}

/**
 * Shadow-parity check (strangler evidence). For the current single-org world
 * the new access set must be exactly the scalar org (or empty when the scalar
 * is null). Any mismatch is a divergence to record — NOT to auto-correct.
 */
export function compareAccessToScalar(scalarOrganisationId: string | null, access: OrganisationAccessSet): { parity: boolean; detail: string } {
  if (scalarOrganisationId === null) {
    return access.length === 0
      ? { parity: true, detail: "both_empty" }
      : { parity: false, detail: `scalar_null_but_access_${access.length}` };
  }
  const parity = access.length === 1 && access[0] === scalarOrganisationId;
  return { parity, detail: parity ? "single_match" : `scalar_vs_access_mismatch(${access.length})` };
}

/**
 * Read the user's active User–Organisation Access from the DB. Returns `null`
 * when the source is UNAVAILABLE (e.g. the migration has not been applied yet)
 * so callers fail closed / fall back to the scalar organisation_id — this is
 * what makes deploying safe before or after the migration. Never throws.
 */
export async function fetchActiveOrganisationAccess(userId: string): Promise<OrganisationAccessSet | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("user_organisation_access")
      .select("organisation_id")
      .eq("user_id", userId)
      .eq("status", "active");
    if (error) return null; // table absent / error → indeterminate; caller falls back
    return (data ?? []).map(r => r.organisation_id as string);
  } catch {
    return null;
  }
}
