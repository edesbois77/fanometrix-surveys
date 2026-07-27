// Access control for framework reports.
//
// Unlike the DB-driven partner reports (lib/reports/access.ts, one hash per
// partner_reports row), a framework report is a code-authored document whose
// password lives in an env var named by its config (access.passwordEnv). That
// keeps the secret out of the bundle and lets a report be re-passworded with an
// env change and a redeploy, no migration.
//
// The unlock primitive itself — a short-lived signed cookie scoped to one report
// id — is shared with the partner reports, so an unlocked framework report is
// exactly as much (and as little) as "this browser answered THIS challenge".
//
// Node-only (bcryptjs). Never import from middleware.ts.

import bcrypt from "bcryptjs";
import type { ReportConfig } from "./types";

export {
  reportCookieName,
  mintUnlockToken,
  isUnlocked,
  UNLOCK_COOKIE_OPTIONS,
} from "@/lib/reports/access";

/** Read the configured hash, tolerating .env variable-expansion.
 *
 *  bcrypt hashes contain `$`, which dotenv-expand (used by @next/env) treats as
 *  interpolation and would mangle. To sidestep that entirely the env holds the
 *  BASE64 of the hash; we decode it here. A value that already looks like a raw
 *  bcrypt hash (someone escaped the `$`) is accepted as-is, so both forms work. */
function resolveHash(raw: string): string {
  if (raw.startsWith("$2")) return raw; // literal (escaped) bcrypt hash
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    if (decoded.startsWith("$2")) return decoded;
  } catch {
    /* fall through */
  }
  return raw;
}

/** Verify a plaintext attempt against the report's configured env hash.
 *
 *  Returns false — never throws — when the env var is missing or malformed, so a
 *  misconfigured report fails closed (locked) rather than crashing the route. */
export async function verifyReportConfigPassword(
  config: ReportConfig,
  plaintext: string,
): Promise<boolean> {
  if (!plaintext) return false;
  const raw = process.env[config.access.passwordEnv];
  if (!raw) {
    console.error(
      `[reports/framework] ${config.access.passwordEnv} is not set — "${config.access.id}" cannot be unlocked`,
    );
    return false;
  }
  try {
    return await bcrypt.compare(plaintext, resolveHash(raw));
  } catch {
    return false;
  }
}
