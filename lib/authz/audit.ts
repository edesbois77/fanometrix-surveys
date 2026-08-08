// ORG-005 · IW-7 — Security Audit & Mandatory-Audit Fail-Closed.
//
// The governed security audit CAPABILITY (Q-29 event requirements, Q-30 integrity
// & privacy). This module is the single writer for durable security evidence and
// the mandatory-audit fail-closed primitive. It performs NO authorisation reads —
// permission is never reconstructed from audit (F048 RETAIN): no decision path
// imports this module's reader.
//
// The durable store, its tamper-evident hash chain, and its append-only
// immutability live in migration 168 (security_audit_events). This module writes
// the minimised event content; the DB trigger computes the chain. Until migration
// 168 is applied the writer is INERT (returns "unavailable") so deploying is safe
// before OR after the migration — and, per Q-34/F045, the mandatory-audit
// fail-closed engages ONLY once the subsystem is available (an unavailable
// pre-activation subsystem must not break current operations).

import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * The governed Q-29 security-significant event classes. Some correspond to
 * mechanisms delivered by other workstreams (Exceptional Resource Access = IW-5;
 * Resource Entitlement = IW-6); those event types exist in the capability but are
 * emitted by their owning workstream — NOT manufactured here.
 */
export type SecurityEventType =
  | "user_organisation_access_change"   // IW-1
  | "role_assignment_change"            // IW-2
  | "product_access_change"             // IW-3
  | "product_capability_change"         // IW-3
  | "resource_entitlement_change"       // IW-6 (reserved emitter)
  | "platform_admin_authority_change"   // IW-5 (reserved emitter)
  | "exceptional_resource_access"       // IW-5 (reserved emitter)
  | "denied_security_admin_attempt"
  | "material_data_access"
  | "denied_data_access_attempt"
  | "user_lifecycle_change"             // create / disable / password reset
  | "access_grant_change"               // user_access_grants
  | "organisation_lifecycle_change";

export type AuditOutcome = "authorised" | "denied" | "changed" | "created" | "removed";

/** A minimised security event. `detail` carries references/meaning ONLY. */
export interface SecurityEvent {
  eventType: SecurityEventType;
  action: string;
  outcome: AuditOutcome;
  actorUserId?: string | null;
  actorLabel?: string | null;
  organisationId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  origin?: string | null;
  detail?: Record<string, unknown>;
}

export type AuditStatus =
  | "recorded"       // durably written
  | "unavailable"    // subsystem not provisioned yet (migration 168 not applied)
  | "error";         // subsystem available but the write FAILED → fail-closed trigger

export interface AuditResult { status: AuditStatus; }

/** Keys that must never appear in a minimised audit `detail` (Q-30). */
const FORBIDDEN_DETAIL_KEYS = ["password", "hashed_password", "token", "secret", "api_key", "content", "body", "answers", "raw", "file", "document"];

/**
 * Q-30 minimisation guard. Pure. Returns false if `detail` embeds prohibited
 * content/secret fields (case-insensitive, by key). Used before writing and in
 * tests — the audit records references and meaning, never protected content.
 */
export function isMinimisedDetail(detail: Record<string, unknown> | undefined): boolean {
  if (!detail) return true;
  const keys = Object.keys(detail).map(k => k.toLowerCase());
  return !keys.some(k => FORBIDDEN_DETAIL_KEYS.some(f => k.includes(f)));
}

/** Pure hash-chain step — mirrors the migration-168 trigger. */
export function entryHash(prevEntryHash: string | null, contentHash: string): string {
  return createHash("sha256").update((prevEntryHash ?? "") + contentHash).digest("hex");
}

/**
 * Pure tamper-evidence verification (Q-30 / F046). Given rows in seq order with
 * their stored { content_hash, prev_hash, entry_hash }, confirm the chain is
 * intact: each entry_hash equals H(prev_entry_hash || content_hash), and prev_hash
 * links to the actual predecessor. Any alteration/insertion/deletion/reordering
 * breaks this. Detection only — the append-only trigger prevents mutation.
 */
export function verifyChain(rows: { content_hash: string; prev_hash: string | null; entry_hash: string }[]): boolean {
  let prev: string | null = null;
  for (const r of rows) {
    if ((r.prev_hash ?? null) !== prev) return false;
    if (r.entry_hash !== entryHash(prev, r.content_hash)) return false;
    prev = r.entry_hash;
  }
  return true;
}

/**
 * Record a durable security event. Guarded and never throws: returns
 * "unavailable" when the store is not yet provisioned (migration 168 absent) so
 * deploying before the migration is safe, "error" when the store IS available but
 * the write failed (the mandatory-audit fail-closed signal), else "recorded".
 * The DB trigger computes the tamper-evident chain; this writer supplies the
 * minimised content only.
 */
export async function recordSecurityEvent(event: SecurityEvent): Promise<AuditResult> {
  const detail = event.detail ?? {};
  // Defensive minimisation — drop the whole detail if it would embed content.
  const safeDetail = isMinimisedDetail(detail) ? detail : {};
  try {
    const { error } = await supabaseAdmin.from("security_audit_events").insert({
      actor_user_id: event.actorUserId ?? null,
      actor_label: event.actorLabel ?? null,
      organisation_id: event.organisationId ?? null,
      event_type: event.eventType,
      action: event.action,
      outcome: event.outcome,
      resource_type: event.resourceType ?? null,
      resource_id: event.resourceId ?? null,
      origin: event.origin ?? null,
      detail: safeDetail,
      // content_hash/prev_hash/entry_hash are set by the trigger; supply a
      // placeholder for NOT NULL columns pre-trigger (trigger overwrites).
      content_hash: "",
      entry_hash: "",
    });
    if (!error) return { status: "recorded" };
    // Undefined relation → subsystem not provisioned yet (safe pre-activation).
    if (error.code === "42P01" || /does not exist/i.test(error.message)) return { status: "unavailable" };
    return { status: "error" };
  } catch {
    return { status: "error" };
  }
}

/** Raised when a mandatory audit could not be durably recorded (SG-7). */
export class MandatoryAuditUnavailableError extends Error {
  constructor() { super("Mandatory security audit could not be recorded; operation refused (fail-closed)."); this.name = "MandatoryAuditUnavailableError"; }
}

/**
 * SG-7 — mandatory-audit fail-closed decision (Q-34/F045). Given a record result
 * for a MANDATORY event, decide whether the operation must be refused. A live
 * subsystem that FAILED to record ("error") → fail closed (refuse). "unavailable"
 * (pre-activation) does NOT fail closed — it preserves current behaviour until
 * the subsystem is provisioned. "recorded" proceeds. Pure.
 */
export function mustFailClosed(result: AuditResult): boolean {
  return result.status === "error";
}

/** Throwing form of the fail-closed gate for mandatory events. */
export function assertMandatoryAudit(result: AuditResult): void {
  if (mustFailClosed(result)) throw new MandatoryAuditUnavailableError();
}

/**
 * Record a MANDATORY security event and fail closed if a live audit subsystem
 * could not durably record it. Records first (the security-significant decision
 * point), then, only if durable (or not-yet-provisioned), runs the operation.
 */
export async function withMandatoryAudit<T>(event: SecurityEvent, op: () => Promise<T>): Promise<T> {
  const result = await recordSecurityEvent(event);
  assertMandatoryAudit(result); // fail-closed when the live subsystem errored
  return op();
}
