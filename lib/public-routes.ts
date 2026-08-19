// ── The public (session-less) route surface, in ONE place ────────────────────
//
// A public survey write path has to be declared in THREE separate places or it
// silently stops working:
//   1. SURVEYS_ALLOWED_PREFIXES  — else surveys.fanometrix.com 302s it to marketing
//   2. PUBLIC_API_PREFIXES       — else the session gate answers it 401
//   3. the middleware `matcher`  — the perf exclusion (must stay consistent with 2)
//
// `/api/answer` was added to none of them when it shipped, so every per-answer save
// from every embed failed for months while the client swallowed the error. These
// constants are exported (rather than living inside middleware.ts) so that fact is
// testable: see lib/public-routes.test.ts.
//
// "Public" means "not gated by a browser session" — NOT "unauthenticated by anyone".
// Machine-to-machine routes on this list enforce their own credential inside the
// handler (/api/cron: CRON_SECRET; /api/reports: per-report password), and the survey
// write paths enforce validation, size limits, a campaign check and a per-session
// throttle inside the handler.

/** Paths served on the survey delivery host (surveys.fanometrix.com). */
export const SURVEYS_ALLOWED_PREFIXES = [
  "/embed",
  "/privacy",
  "/api/embed",
  "/api/submit",
  "/api/answer",
  "/api/reporting",
  "/api/events",
] as const;

/** API paths excluded from the browser-session auth gate. */
export const PUBLIC_API_PREFIXES = [
  "/api/auth",
  "/api/submit",
  "/api/answer",
  "/api/reporting",
  "/api/embed",
  "/api/access-requests",
  "/api/publisher",
  "/api/dashboard",
  "/api/events",
  "/api/cron",
  "/api/reports",
] as const;

/**
 * The public survey write/delivery paths that MUST also be excluded from the
 * middleware matcher. Kept here as the checklist the matcher literal is verified
 * against — Next.js requires the matcher itself to be a statically analysable
 * literal, so it cannot be built from this array.
 */
export const PUBLIC_EMBED_PATHS = [
  "/embed",
  "/api/embed",
  "/api/events",
  "/api/submit",
  "/api/answer",
] as const;
