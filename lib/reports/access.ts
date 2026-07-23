// Per-report access control for partner reports.
//
// Each report carries its own password (partner_reports.password_hash), so
// revoking one partner's link never touches another's, and a forwarded link is
// useless without the password that came with it. There is deliberately no
// global report password: this is the shape the Organisations area will
// inherit, where access is per organisation and per report rather than one
// shared secret for everything Fanometrix publishes.
//
// Unlocking mints a short-lived signed cookie scoped to a single report id. The
// cookie proves "this browser answered the challenge for THIS report" and
// nothing else — it is not a session, carries no identity, and grants no access
// to the platform.
//
// Node-only (bcryptjs). Never import from middleware.

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

const UNLOCK_DURATION_SECONDS = 60 * 60 * 12; // 12 hours

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET env var is not set");
  return new TextEncoder().encode(s);
}

/** One cookie per report, so unlocking one never unlocks another. */
export function reportCookieName(reportId: string): string {
  return `fmx_report_${reportId.replace(/-/g, "")}`;
}

export async function verifyReportPassword(
  plaintext: string,
  passwordHash: string,
): Promise<boolean> {
  if (!plaintext) return false;
  try {
    return await bcrypt.compare(plaintext, passwordHash);
  } catch {
    return false;
  }
}

export async function hashReportPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, 10);
}

export async function mintUnlockToken(reportId: string): Promise<string> {
  return new SignJWT({ rid: reportId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${UNLOCK_DURATION_SECONDS}s`)
    .sign(secret());
}

/** True only when the token was signed by us, is unexpired, and names exactly
 *  this report. A token for another report is not "close enough". */
export async function isUnlocked(token: string | undefined, reportId: string): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.rid === reportId;
  } catch {
    return false;
  }
}

export const UNLOCK_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: UNLOCK_DURATION_SECONDS,
};
