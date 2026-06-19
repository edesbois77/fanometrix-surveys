// Edge-compatible: only imports from 'jose' and standard Web APIs.
// Safe to import in middleware.ts. Do NOT import bcryptjs here.
import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";

export type UserRole = "admin" | "brand" | "agency" | "publisher";

export type SessionPayload = {
  sub: string;
  username: string;
  role: UserRole;
  organisationName: string | null;
  allowedCampaignIds: string[];
  allowedPublisherIds: string[];
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

/**
 * Verify session and optionally check role.
 * Returns the session payload or throws a Response (for use in API routes).
 */
export async function requireSession(
  req: Request | NextRequest,
  allowedRoles?: UserRole[]
): Promise<SessionPayload> {
  const session = await getSession(req);
  if (!session) {
    throw new Response(JSON.stringify({ error: "Unauthorised" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (allowedRoles && !allowedRoles.includes(session.role)) {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return session;
}
