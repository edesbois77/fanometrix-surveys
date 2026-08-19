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
//     impression; a genuine 1-5 question journey fires at most ~26 requests, so a
//     per-session cap has no effect on real users.
//
// The window/cap are deliberately generous: they only ever catch a session that
// is emitting an order of magnitude more events than the survey can produce.

const WINDOW_MS = 10 * 60_000; // ~ a survey session's lifetime
// A fully engaged 5-question journey now costs far more than the ~6 beacons this cap
// was sized for: render + visible + intro viewed/continued + Q1 shown + 4 reached +
// start + 5 answered + completed = 16 events, PLUS 5 answer saves (which share this
// bucket) and their retries. That is ~21-26 for a legitimate respondent, so 30 was
// close enough to the ceiling to start dropping real evidence. 120 keeps a wide
// margin over any real journey while still stopping a client hammering one instance.
const MAX_EVENTS = 120;
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
