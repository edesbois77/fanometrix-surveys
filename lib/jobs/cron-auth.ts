// Authentication for the cron worker route (/api/cron/jobs/tick). This route is
// machine-to-machine — triggered by Supabase pg_cron, never a browser session —
// so it is deliberately EXCLUDED from the normal session-auth middleware and
// instead enforces its own bearer-token check here. Excluded from session auth
// is NOT the same as public: without a matching CRON_SECRET this returns false.
import { timingSafeEqual } from "node:crypto";

/** True only when a CRON_SECRET is configured AND the Authorization header is
 *  exactly `Bearer <secret>`.
 *  - Fails closed when the secret is unset, so a missing env var can never mean
 *    "open".
 *  - Constant-time comparison so a caller can't recover the secret byte-by-byte
 *    from response timing. */
export function isCronAuthorized(authorizationHeader: string | null | undefined, secret: string | undefined): boolean {
  if (!secret) return false;                 // fail closed — never open when unconfigured
  if (!authorizationHeader) return false;
  const provided = Buffer.from(authorizationHeader);
  const expected = Buffer.from(`Bearer ${secret}`);
  // timingSafeEqual requires equal lengths; an unequal length is itself a
  // mismatch, and returning early here leaks only length, never content.
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
