// ORG-007 · CF-003 (NFR-005) — Operational detection & diagnosis for material
// Organisation / Organisation Context failures.
//
// SCOPE & BOUNDARY. This is OPERATIONAL TELEMETRY only. It is deliberately, and
// permanently, distinct from:
//   • SECURITY AUDIT (security_audit_events / lib/authz/audit.ts) — a hash-chained
//     record of governed *successful* changes. This module writes NO audit event
//     and is never an audit substitute.
//   • AUTHORISATION EXPLANATION — the user-facing reason a request was allowed or
//     denied. This module emits to the server operational log ONLY; it never alters
//     an HTTP response, never weakens Platform Authorisation, and never surfaces
//     diagnostic detail to an unauthorised caller.
//
// ORG-005 LEAST-DISCLOSURE. An operational signal carries only what an operator
// needs to detect and localise a failure: a coded event/capability/reason and the
// internal identifiers (userId / organisationId UUIDs) needed to correlate it.
// It MUST NOT carry secrets, credentials, tokens, password hashes, email addresses,
// personal names, or role *values*. `redactDetail` strips any such field defensively
// so a careless caller cannot leak through `detail`.
//
// It is intentionally minimal: a single structured line to the platform log
// (Vercel captures stdout/stderr). It is NOT a general observability platform.

export type OperationalSeverity = "warn" | "error";

/** A safe, coded operational signal. `detail` may carry only non-sensitive coded
 *  facts (counts, enum-like strings, ids) — it is redacted before emission. */
export interface OperationalEvent {
  event: string;        // dotted class, e.g. "organisation_context.contextual_role_missing"
  capability: string;   // the affected capability/context, e.g. "contextual_role_projection"
  reason: string;       // coded machine reason, e.g. "no_role_binding_for_active_context"
  severity: OperationalSeverity;
  userId?: string | null;
  organisationId?: string | null;
  detail?: Record<string, string | number | boolean | null>;
}

interface EmittedRecord extends OperationalEvent {
  ts: string;
  domain: "organisation_context";
}

export type OperationalSink = (record: EmittedRecord) => void;

const LOG_PREFIX = "[fnmx.op]";

// Anything whose KEY looks like a credential / identity leak is dropped from detail.
const SENSITIVE_KEY = /token|secret|password|passwd|pwd|hash|cookie|authorization|auth_?header|jwt|bearer|email|first_?name|last_?name|full_?name|\brole\b/i;
const MAX_DETAIL_STR = 200;

/** Defensively strip any sensitive-looking field and cap string sizes. Pure. */
export function redactDetail(
  detail: Record<string, string | number | boolean | null> | undefined,
): Record<string, string | number | boolean | null> | undefined {
  if (!detail) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(detail)) {
    if (SENSITIVE_KEY.test(k)) continue; // never emit a sensitive-looking field
    out[k] = typeof v === "string" && v.length > MAX_DETAIL_STR ? v.slice(0, MAX_DETAIL_STR) : v;
  }
  return out;
}

const defaultSink: OperationalSink = (record) => {
  // console.error/warn is captured by the platform log; single structured line.
  const line = `${LOG_PREFIX} ${JSON.stringify(record)}`;
  if (record.severity === "error") console.error(line);
  else console.warn(line);
};

let sink: OperationalSink = defaultSink;

/** Test/wiring seam: replace the sink (null restores the default platform-log sink). */
export function setOperationalTelemetrySink(next: OperationalSink | null): void {
  sink = next ?? defaultSink;
}

/**
 * Emit one operational signal. Never throws into the caller's path (a telemetry
 * failure must never affect request handling or an authorisation outcome). Returns
 * the record it emitted (redacted) so call sites/tests can assert on it.
 */
export function recordOperationalEvent(evt: OperationalEvent): EmittedRecord {
  const record: EmittedRecord = {
    ts: new Date().toISOString(),
    domain: "organisation_context",
    event: evt.event,
    capability: evt.capability,
    reason: evt.reason,
    severity: evt.severity,
    userId: evt.userId ?? null,
    organisationId: evt.organisationId ?? null,
    detail: redactDetail(evt.detail),
  };
  try {
    sink(record);
  } catch {
    /* telemetry must never disrupt the request/authorisation path */
  }
  return record;
}

// ── Pure classifiers (the detection/diagnosis logic; exhaustively unit-tested) ──

/** The state of Organisation Context resolution at an auth juncture (login or a
 *  request), as observed by the caller after running the governed readers. */
export interface ContextObservation {
  phase: "login" | "request";
  userId: string;
  /** fetchActiveOrganisationAccess returned null (source indeterminate/unavailable). */
  accessIndeterminate: boolean;
  /** Size of the Accessible Organisation Set (0 when indeterminate or genuinely none). */
  accessSetSize: number;
  /** A single Current Organisation resolved (never a union). */
  activeOrganisationId: string | null;
  /** The contextual role bound to the active context, or null if none resolved. */
  contextualRole: string | null;
}

/**
 * Classify an Organisation Context resolution into an operational signal, or null
 * when the state is healthy or a NORMAL governed state (e.g. selection_required).
 *
 * Detects the material failure classes established by the ORG-006 incidents:
 *  - the login-role projection failure → `contextual_role_missing` (a Current
 *    Organisation resolved but NO contextual role binds to it), and
 *  - Organisation Context resolution failures → `access_indeterminate` / `no_access`.
 * Pure and deterministic. Emits NO role value — only that a binding is absent.
 */
export function organisationContextSignal(o: ContextObservation): OperationalEvent | null {
  if (o.accessIndeterminate) {
    return {
      event: "organisation_context.access_indeterminate",
      capability: "organisation_context_resolution",
      reason: "access_source_unavailable",
      severity: "error",
      userId: o.userId,
      organisationId: null,
      detail: { phase: o.phase },
    };
  }
  if (o.accessSetSize === 0) {
    return {
      event: "organisation_context.no_access",
      capability: "organisation_context_resolution",
      reason: "empty_access_set",
      severity: o.phase === "request" ? "error" : "warn",
      userId: o.userId,
      organisationId: null,
      detail: { phase: o.phase },
    };
  }
  // A single Current Organisation resolved but no role binds to it: this is exactly
  // the login-role projection failure class (the JWT/hint would project an absent
  // role and admin surfaces would deny with no explanation of the cause).
  if (o.activeOrganisationId !== null && o.contextualRole === null) {
    return {
      event: "organisation_context.contextual_role_missing",
      capability: "contextual_role_projection",
      reason: "no_role_binding_for_active_context",
      severity: "error",
      userId: o.userId,
      organisationId: o.activeOrganisationId,
      detail: { phase: o.phase, accessSetSize: o.accessSetSize },
    };
  }
  // Multiple authorised organisations, none resolved: this is the GOVERNED
  // selection_required state, not a failure. No signal.
  return null;
}

/** Observation for an explicit Primary Organisation designation. */
export interface PrimaryDesignationObservation {
  userId: string;
  targetOrganisationId: string;
  /** The user's current ACTIVE access organisation ids. */
  activeAccessOrganisationIds: string[];
}

/**
 * Classify an explicit Primary Organisation designation into an operational signal,
 * or null when it is coherent. Detects the Primary Organisation inconsistency class:
 * a designation that silently no-ops because the target is not an active member of
 * the user's Accessible Organisation Set, or the user has no active access at all —
 * conditions that previously produced a silent, undiagnosable inconsistency.
 * Pure and deterministic.
 */
export function primaryDesignationSignal(o: PrimaryDesignationObservation): OperationalEvent | null {
  if (o.activeAccessOrganisationIds.length === 0) {
    return {
      event: "primary_organisation.no_active_access",
      capability: "primary_organisation_designation",
      reason: "no_active_access_rows",
      severity: "warn",
      userId: o.userId,
      organisationId: o.targetOrganisationId,
    };
  }
  if (!o.activeAccessOrganisationIds.includes(o.targetOrganisationId)) {
    return {
      event: "primary_organisation.target_not_in_access_set",
      capability: "primary_organisation_designation",
      reason: "target_not_in_active_access_set",
      severity: "warn",
      userId: o.userId,
      organisationId: o.targetOrganisationId,
      detail: { accessSetSize: o.activeAccessOrganisationIds.length },
    };
  }
  return null;
}

/** Convenience: classify and, if a signal results, emit it. Returns the emitted
 *  record or null. Used at the real call sites so detection is centralised. */
export function reportOrganisationContext(o: ContextObservation): EmittedRecord | null {
  const sig = organisationContextSignal(o);
  return sig ? recordOperationalEvent(sig) : null;
}

export function reportPrimaryDesignation(o: PrimaryDesignationObservation): EmittedRecord | null {
  const sig = primaryDesignationSignal(o);
  return sig ? recordOperationalEvent(sig) : null;
}
