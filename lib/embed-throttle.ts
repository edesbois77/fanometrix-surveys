// Best-effort, in-memory event throttle for the public survey embed.
//
// SCOPE / LIMITS — read before trusting this:
//   • It is PER-INSTANCE. Vercel spreads traffic across many function instances,
//     so this is NOT a global rate limiter. It is a cheap first line that stops a
//     single client hammering one warm instance and keeps obvious spam out of the
//     survey_events table. Durable/global limiting belongs at the Vercel Firewall
//     (rate rules) — see the Stage 5 notes; that layer needs no code or migration.
//   • It is keyed by the survey SESSION id, never by IP. Mobile fans on the same
//     publisher (LiveScore, FotMob, …) routinely share a carrier-NAT IP, so an
//     IP limit would blanket-block real traffic. A session_id is unique per
//     impression; a genuine session fires <=5 events, so a per-session cap has no
//     effect on real users.
//
// The window/cap are deliberately generous: they only ever catch a session that
// is emitting an order of magnitude more events than the survey can produce.

const WINDOW_MS = 10 * 60_000; // ~ a survey session's lifetime
const MAX_EVENTS = 30;         // real sessions fire <=5; 30 is pure headroom
const MAX_KEYS = 50_000;       // hard memory ceiling for the bucket map

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Returns true if this session may record another event, false if it has
 *  exceeded MAX_EVENTS within the current window. `now` is injectable for tests. */
export function allowSessionEvent(sessionId: string, now: number = Date.now()): boolean {
  // Opportunistic cleanup so the map cannot grow without bound under churn/attack.
  if (buckets.size >= MAX_KEYS) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    // Still full despite sweeping (sustained flood of fresh sessions): evict the
    // oldest-inserted entry. Map preserves insertion order.
    if (buckets.size >= MAX_KEYS) {
      const oldest = buckets.keys().next().value;
      if (oldest !== undefined) buckets.delete(oldest);
    }
  }

  const b = buckets.get(sessionId);
  if (!b || b.resetAt <= now) {
    buckets.set(sessionId, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  b.count += 1;
  return b.count <= MAX_EVENTS;
}

/** Test-only: reset internal state between cases. */
export function __resetThrottle(): void {
  buckets.clear();
}

export const __THROTTLE_LIMITS = { WINDOW_MS, MAX_EVENTS, MAX_KEYS } as const;
