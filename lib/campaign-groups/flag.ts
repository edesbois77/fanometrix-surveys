// -- Studio Campaign Groups: the server-controlled rollout gate ---------------
//
// CAMPAIGN_GROUPS_STUDIO_ENABLED, default OFF. Absent means off; only the exact
// strings "true" or "1" enable the feature. Anything else - "yes", "TRUE", "on",
// a stray space - is off, because a rollout gate that guesses at intent is worse
// than one that stays shut.
//
// SERVER-ONLY, deliberately. The variable carries no NEXT_PUBLIC_ prefix, so it
// is never inlined into the client bundle and cannot be read or spoofed by a
// browser. The Manage UI learns its state from a server component that passes
// the resolved boolean down as a prop - the flag itself never crosses the
// boundary.
//
// What the gate covers, and what it deliberately does not:
//
//   COVERED   the Studio Campaign Groups UI, the Studio group management APIs,
//             and the Studio serve endpoint. All three behave as though the
//             feature does not exist.
//   NOT       every legacy Campaign Group route and the legacy delivery path.
//             They contain no reference to this flag at all - a rollout gate on
//             a NEW capability must not become a new way for live delivery to
//             fail. That absence is asserted by test, not just intended.
//
// A disabled feature returns 404, never 403 and never a fail_mode refusal: when
// the flag is off the capability does not exist, so it should be indistinguishable
// from a URL that was never built. A 403 would confirm the feature is there and
// merely withheld.

/**
 * Is the Studio Campaign Groups capability enabled?
 *
 * `env` is injectable so the gate can be tested at both settings without
 * mutating process.env, which leaks between test files run in one process.
 */
export function campaignGroupsStudioEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const v = env.CAMPAIGN_GROUPS_STUDIO_ENABLED;
  return v === "true" || v === "1";
}

/** The single 404 body used everywhere the gate closes, so a disabled route is
 *  byte-identical to a genuinely absent one. */
export const DISABLED_RESPONSE = { error: "Not found" } as const;
