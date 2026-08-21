// ── Delivery-integrity diagnostics ──────────────────────────────────────────
//
// A supplied-but-invalid configuration claim is not an ordinary unattributed
// journey and must never be filed as one. The evidence row is still written —
// the respondent's answer is never discarded over its provenance — but the fact
// that SOMETHING claimed a revision it was not entitled to has to be visible to
// an operator, or forged attribution looks exactly like legacy traffic.
//
// SCOPE. This is a sibling of lib/observability/operational-telemetry.ts, not a
// reuse of it: that module is permanently scoped to the organisation-context
// domain and explicitly declares itself not a general observability platform.
// This one carries the same discipline (one structured line, a sink seam, never
// throws into the request path) for a different domain.
//
// LEAST DISCLOSURE, BOTH WAYS.
//   • Outward: nothing here reaches the HTTP response. An anonymous caller
//     learns only that the write succeeded, exactly as before, so the endpoint
//     cannot be used to probe whether a group or revision exists.
//   • Inward: coded reasons and identifiers only. NEVER answer content, never
//     question text, never anything a respondent said.

export type DeliveryIntegrityEndpoint = "events" | "answer" | "submit";

export interface DeliveryIntegritySignal {
  /** Coded rejection reason — a RevisionValidationCode other than "valid". */
  reason: string;
  claimedRevisionId: string | null;
  campaignId: string | null;
  claimedGroupId: string | null;
  sessionId: string | null;
  endpoint: DeliveryIntegrityEndpoint;
}

export interface DeliveryIntegrityRecord extends DeliveryIntegritySignal {
  ts: string;
  domain: "delivery_integrity";
  /** How many occurrences this line stands for, including suppressed repeats. */
  occurrences: number;
}

export type DeliveryIntegritySink = (record: DeliveryIntegrityRecord) => void;

const LOG_PREFIX = "[fnmx.integrity]";

const defaultSink: DeliveryIntegritySink = (record) => {
  console.warn(`${LOG_PREFIX} ${JSON.stringify(record)}`);
};

let sink: DeliveryIntegritySink = defaultSink;

/** Test/wiring seam: replace the sink (null restores the platform-log sink). */
export function setDeliveryIntegritySink(next: DeliveryIntegritySink | null): void {
  sink = next ?? defaultSink;
}

// ── Deduplication ───────────────────────────────────────────────────────────
//
// One forged session emits on EVERY event, answer and submission — a single
// journey can be dozens of writes. Without this, one bad actor drowns the log
// the diagnostic exists to make readable. Keyed by session+reason+endpoint so a
// session that fails two DIFFERENT ways still reports both.

const WINDOW_MS = 60_000;
const MAX_KEYS = 5_000;   // bounded: a flood of forged sessions cannot grow it without limit

interface Seen { firstAt: number; count: number; emitted: boolean }
const seen = new Map<string, Seen>();

/** Testing seam — the module keeps process-wide state. */
export function __resetDeliveryIntegrity(): void { seen.clear(); }

function sweep(now: number): void {
  if (seen.size < MAX_KEYS) return;
  for (const [k, v] of seen) {
    if (now - v.firstAt >= WINDOW_MS) seen.delete(k);
    if (seen.size < MAX_KEYS) break;
  }
  // Still full of live entries: drop the oldest insertion rather than grow.
  if (seen.size >= MAX_KEYS) {
    const oldest = seen.keys().next();
    if (!oldest.done) seen.delete(oldest.value);
  }
}

/**
 * Report a supplied-but-invalid configuration claim.
 *
 * Returns the record when it was emitted, or null when suppressed as a repeat.
 * Never throws: a diagnostic failure must not affect the evidence write.
 */
export function reportDeliveryIntegrity(
  signal: DeliveryIntegritySignal,
  nowMs: number = Date.now(),
): DeliveryIntegrityRecord | null {
  const key = `${signal.sessionId ?? "-"}|${signal.reason}|${signal.endpoint}`;
  const hit = seen.get(key);

  if (hit && nowMs - hit.firstAt < WINDOW_MS) {
    hit.count += 1;
    return null;   // suppressed repeat inside the window
  }

  sweep(nowMs);
  // A key rolling over its window reports the total it stood for, so a long
  // forged session shows its true volume rather than looking like one stray hit.
  const carried = hit ? hit.count : 0;
  seen.set(key, { firstAt: nowMs, count: 1, emitted: true });

  const record: DeliveryIntegrityRecord = {
    ts: new Date(nowMs).toISOString(),
    domain: "delivery_integrity",
    reason: signal.reason,
    claimedRevisionId: signal.claimedRevisionId,
    campaignId: signal.campaignId,
    claimedGroupId: signal.claimedGroupId,
    sessionId: signal.sessionId,
    endpoint: signal.endpoint,
    occurrences: carried + 1,
  };
  try { sink(record); } catch { /* never disrupt the evidence write */ }
  return record;
}
