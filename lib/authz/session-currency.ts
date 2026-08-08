// ORG-005 · IW-9 — Session/Token Lifecycle & Currency.
//
// Governed by Q-31/Q-33 (Workshop §29/§31/§32). Adds session/token REVOCATION
// (F058) and enforces forced-password-change on LIVE sessions (F059), while
// RETAINING the conforming currency base: live re-fetch authority (F003), F057
// (immediate, dependency-scoped revocation), F060 (anti-resurrection — stale
// state never resurrects authority) and F061 (no uncontrolled cascade).
//
// MECHANISM — a per-user "token version" (session epoch), users.token_version.
// The identity JWT carries the version at ISSUE (`tv`); requireUser — which
// already live-re-fetches the user (F003) — compares it to the CURRENT value.
// Incrementing the version supersedes every session issued before it:
//   • explicit revoke / user disable → bump → all live sessions invalid (F058);
//   • password change / forced-password-change set → bump → stale sessions
//     invalid, forcing re-auth where the live force-change flag then applies (F059).
// A bump is dependency-scoped to ONE user (no cascade, F061); a stale token can
// never out-vote the current version (anti-resurrection, F060). The JWT stays
// identity-only (F001) — `tv` is a currency epoch, not an authority claim.
//
// STRANGLER / DDL BOUNDARY. The pure check below is deploy-safe and the guarded
// DB helpers no-op until migration 169 adds the column, so a stale/absent version
// is treated as "current" (never a false revocation) pre-activation. The live
// enforcement cut-over (requireUser comparing versions) + revocation triggers are
// the governed ACTIVATION after migration 169 is hand-applied.

import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Q-33 — is a session REVOKED? A session is revoked when its issued token version
 * differs from the current live version. If EITHER is undefined (legacy token, or
 * the column not yet provisioned) the session is treated as current — the
 * mechanism never manufactures a false revocation pre-activation (fail-safe, and
 * disable/status remains the immediate authority via requireUser regardless).
 * Pure and deterministic.
 */
export function isSessionRevoked(sessionTokenVersion: number | undefined, liveTokenVersion: number | undefined): boolean {
  if (sessionTokenVersion === undefined || liveTokenVersion === undefined) return false;
  return sessionTokenVersion !== liveTokenVersion;
}

/**
 * Guarded read of the user's current token version. Returns `undefined` when the
 * column is not provisioned (migration 169 not applied) or on error, so callers
 * fail safe (treat as current). Never throws.
 */
export async function fetchTokenVersion(userId: string): Promise<number | undefined> {
  try {
    const { data, error } = await supabaseAdmin.from("users").select("token_version").eq("id", userId).maybeSingle();
    if (error || !data || (data as { token_version?: number }).token_version == null) return undefined;
    return (data as { token_version: number }).token_version;
  } catch {
    return undefined;
  }
}

/**
 * Revoke a user's live sessions by incrementing their token version (F058/F059).
 * Guarded and best-effort: a no-op when the column is unprovisioned. Read-then-
 * increment is safe for this low-frequency, monotonic operation — any bump
 * invalidates every earlier-issued token, which is the required effect. Returns
 * the new version, or `undefined` when unprovisioned. Never throws.
 */
export async function bumpTokenVersion(userId: string): Promise<number | undefined> {
  try {
    const current = await fetchTokenVersion(userId);
    if (current === undefined) return undefined; // column unprovisioned → inert
    const next = current + 1;
    const { error } = await supabaseAdmin.from("users").update({ token_version: next }).eq("id", userId);
    return error ? undefined : next;
  } catch {
    return undefined;
  }
}
