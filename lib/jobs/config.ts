// Tunables for the background-job framework. Env-overridable so operators can
// adjust recovery aggressiveness without a code change; sane defaults otherwise.

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Default retry ceiling for a job (a consumer can override per-enqueue). After
 *  this many attempts a still-failing job lands in requires_review. */
export const DEFAULT_MAX_ATTEMPTS = intEnv("JOBS_MAX_ATTEMPTS", 4);

/** Lease duration granted on claim. A running job whose lease expires is assumed
 *  dead and becomes reclaimable. Matches the worker route's maxDuration (300s) so
 *  a single long job can finish within one invocation before looking abandoned. */
export const DEFAULT_LEASE_SECONDS = intEnv("JOBS_LEASE_SECONDS", 300);

/** Wall-clock budget for one worker tick's drain loop. Kept below maxDuration so
 *  the route returns cleanly rather than being killed mid-job. */
export const TICK_BUDGET_MS = intEnv("JOBS_TICK_BUDGET_MS", 250_000);

/** Backoff before a transient-failed job becomes eligible again. Exponential in
 *  the attempt just completed, capped, with jitter to avoid a thundering herd.
 *  Returns seconds. */
export function backoffSeconds(attemptsSoFar: number): number {
  const base = 30;
  const cap = 3600; // 1h
  const exp = Math.min(cap, base * 2 ** Math.max(0, attemptsSoFar - 1));
  const jitter = Math.floor(Math.random() * base);
  return Math.min(cap, exp + jitter);
}
