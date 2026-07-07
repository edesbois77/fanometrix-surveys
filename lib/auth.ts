// Edge-compatible: only imports from 'jose' and standard Web APIs.
// Safe to import in middleware.ts. Do NOT import bcryptjs or
// supabase-admin here.
//
// The JWT is identity-only: it proves who the user is (sub), not what
// they're allowed to do. `role` and `forcePasswordChange` are carried
// along purely as coarse, non-authoritative hints for middleware's route
// redirects and client-side UI (e.g. "should the sidebar show admin
// links") — they can lag reality by up to the session's lifetime. Actual
// authorization always re-fetches the live role/organisation/access
// scope/status from the database — see lib/auth-server.ts's
// requireUser(), used by every API route. Never gate real data access on
// this module's session payload alone.
import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";

export type UserRole = "admin" | "brand" | "agency" | "publisher";

export type SessionPayload = {
  sub: string;
  role: UserRole;
  forcePasswordChange: boolean;
  iat: number;
  exp: number;
};

export const SESSION_COOKIE_NAME = "fanometrix_session";
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET env var is not set");
  return new TextEncoder().encode(secret);
}

export async function signJwt(
  payload: Omit<SessionPayload, "iat" | "exp">
): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifyJwt(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession(
  req: Request | NextRequest
): Promise<SessionPayload | null> {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;

  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`)
  );
  if (!match) return null;

  return verifyJwt(match[1]);
}
