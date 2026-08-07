// ORG-005 · IW-2 — Contextual Roles as Permission Profiles.
//
// Governed by the frozen Implementation Programme Plan v1.0 (IW-2). Closes Q-11
// and the REPLACE disposition on F010 (global identity enum → contextual
// permission profile), and underpins F013/F014.
//
// THE MODEL. A **Role** here is a reusable, named **permission profile** bound
// to a User–Organisation Access — i.e. a role CONTEXTUAL to the Organisation the
// user is currently operating in (the Active Organisation Context resolved by
// IW-1). It is NOT a global identity attribute and NOT a real-world description
// of the Organisation.
//
// TWO INDEPENDENT AXES (Q-11 separation; F034 must never regress):
//   • Organisation CLASSIFICATION / type — "what the Organisation IS"
//     (organisations.type). A property of the Organisation.
//   • Role / permission PROFILE — "what the user may DO in this context"
//     (user_organisation_access.role). A property of the Access.
// These axes are orthogonal. This module resolves the Role axis ONLY and MUST
// NEVER derive a Role from an Organisation's classification — resolution takes
// Access bindings as input and never reads organisation type.
//
// STRANGLER SCOPE (what IW-2 is NOT). During migration the contextual Role is
// backfilled 1:1 from the legacy global `users.role`, so current permissions are
// preserved exactly and, for single-Access users, contextual == legacy (parity).
// IW-2 does NOT: build Product/Capability layers (IW-3), introduce composition
// or remove the admin super-ALLOW (IW-4/5), manufacture scoped Platform
// Administration (IW-5), or decommission the legacy `users.role` (a later
// governed step). The `admin` profile is carried through UNCHANGED — IW-2 adds
// no new admin semantics; scoped admin authority is IW-5.
//
// The pure functions below are the security-critical core and are exhaustively
// unit-tested; the DB reader is best-effort (returns null when the column is
// unavailable) so deploying before OR after migration 166 is safe — callers fall
// back to the legacy role. This module is NOT wired to be authoritative here;
// the read cut-over is a governed post-migration activation step.

import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * The permission-profile catalogue. During the strangler migration this mirrors
 * the legacy role values 1:1 to preserve current permissions. The values are
 * PROFILE NAMES (what a user may do in context), deliberately the same tokens as
 * the legacy enum ONLY so backfill is identity-preserving — refining the
 * catalogue away from real-world names is a separate, later concern, not IW-2.
 */
export type PermissionProfile = "admin" | "brand" | "agency" | "publisher";

export const KNOWN_PROFILES: readonly PermissionProfile[] = ["admin", "brand", "agency", "publisher"] as const;

export function isKnownProfile(value: string | null | undefined): value is PermissionProfile {
  return value != null && (KNOWN_PROFILES as readonly string[]).includes(value);
}

/** A contextual Role binding: the permission profile granted on one Access. */
export interface ContextualRoleBinding {
  organisationId: string;
  role: PermissionProfile;
}

export type EffectiveRoleSource = "contextual" | "legacy_fallback";

export interface EffectiveRole {
  role: PermissionProfile;
  source: EffectiveRoleSource;
}

/**
 * Pick the Role for the Active Organisation Context ONLY (Q-11 + Q-06). This is
 * the no-carry-over guarantee expressed on the Role axis: a user's role in one
 * Organisation NEVER applies in another. Resolution reads the binding whose
 * organisationId equals the active context and returns null if there is none —
 * it NEVER unions roles across contexts and NEVER falls back to a different
 * context's role. Pure and deterministic.
 *
 * Returns null when the active context is null (no context → no contextual role)
 * or when no binding matches (caller falls back to the legacy role).
 */
export function roleForContext(
  bindings: ContextualRoleBinding[],
  activeOrganisationId: string | null,
): PermissionProfile | null {
  if (activeOrganisationId === null) return null;
  const match = bindings.find(b => b.organisationId === activeOrganisationId);
  return match ? match.role : null;
}

/**
 * The effective Role during the strangler migration. Prefer the contextual Role
 * (authoritative target); fall back to the legacy global role ONLY when no
 * contextual Role is resolved (column not yet applied, reader unavailable, or no
 * binding for the context) — this fail-safe is what preserves current behaviour
 * and makes deploy-before-migration safe. Pure and deterministic.
 */
export function resolveEffectiveRole(
  contextualRole: PermissionProfile | null,
  legacyRole: PermissionProfile,
): EffectiveRole {
  return contextualRole !== null
    ? { role: contextualRole, source: "contextual" }
    : { role: legacyRole, source: "legacy_fallback" };
}

/**
 * Shadow-parity check (strangler evidence). For the current single-Access world
 * the contextual Role must equal the legacy global role. A null contextual Role
 * is NOT a divergence (it is the safe fallback path, not a mismatch). Any
 * present-but-different value is a divergence to RECORD — never to auto-correct.
 * Pure and deterministic.
 */
export function roleParity(
  contextualRole: PermissionProfile | null,
  legacyRole: PermissionProfile,
): { parity: boolean; detail: string } {
  if (contextualRole === null) return { parity: true, detail: "no_contextual_role_fallback_to_legacy" };
  return contextualRole === legacyRole
    ? { parity: true, detail: "contextual_matches_legacy" }
    : { parity: false, detail: "contextual_vs_legacy_mismatch" };
}

/**
 * Read the user's contextual Role for the Active Organisation Context from the
 * DB. Returns `null` when the source is UNAVAILABLE (migration 166 not applied,
 * error, or no active binding for the context) so callers fall back to the
 * legacy `users.role` — this is what makes deploying safe before or after the
 * migration. Reads ONLY the Role axis (never organisation classification/type).
 * Never throws.
 */
export async function fetchContextualRole(
  userId: string,
  activeOrganisationId: string | null,
): Promise<PermissionProfile | null> {
  if (activeOrganisationId === null) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("user_organisation_access")
      .select("role")
      .eq("user_id", userId)
      .eq("organisation_id", activeOrganisationId)
      .eq("status", "active")
      .maybeSingle();
    if (error || !data) return null; // column/row absent → indeterminate; caller falls back
    return isKnownProfile(data.role) ? data.role : null;
  } catch {
    return null;
  }
}
