// P0 Supabase exposure remediation — who may mark a response as demo data.
//
// POST /api/submit is a public, session-less endpoint, and it used to take
// `is_demo` straight from the request body (`is_demo: !!is_demo`). Two problems
// followed from that:
//   1. Anyone could post completions flagged as demo, so they were excluded from
//      real counts while still occupying the campaign.
//   2. DELETE /api/demo/delete removes rows on `is_demo = true` with no other
//      condition, so a client-controlled flag decided what a later admin action
//      would destroy.
//
// The flag is legitimate for exactly one caller: the internal /embed-test QA
// harness, which is an authenticated admin page submitting through the same
// endpoint. So the rule is: anonymous submissions are ALWAYS real; only an
// authenticated admin may assert `is_demo`.
import type { AuthedUser } from "@/lib/auth-server";

/**
 * The authoritative `is_demo` value for a submission.
 *
 * Pure and total: an unauthenticated caller, a non-admin, or any value other
 * than boolean `true` all resolve to false. Deliberately strict about the input
 * type — the previous `!!is_demo` accepted "false", 1 and {} as true.
 */
export function resolveDemoFlag(requested: unknown, session: AuthedUser | null): boolean {
  if (requested !== true) return false;
  return session?.role === "admin";
}
