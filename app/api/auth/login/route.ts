import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { signJwt, SESSION_COOKIE_NAME, SESSION_DURATION_SECONDS, type UserRole } from "@/lib/auth";
import { fetchActiveOrganisationAccess, resolveActiveContext } from "@/lib/authz/organisation-access";
import { fetchContextualRole } from "@/lib/authz/role-profile";

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  // Case-insensitive exact match, mirroring the old username lookup.
  const { data: user, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .ilike("work_email", email.trim())
    .eq("status", "active")
    .single();

  // Constant-time comparison even on not-found, to avoid timing attacks
  // revealing which emails are registered.
  const DUMMY_HASH =
    "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
  const hashToCheck = user?.hashed_password ?? DUMMY_HASH;
  const passwordMatch = await bcrypt.compare(password, hashToCheck);

  if (error || !user || !passwordMatch) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }

  // The JWT is identity-only from here on — role/organisation/access
  // scope are always re-fetched live from the database on every request
  // (see lib/auth-server.ts's requireUser()), never trusted from the
  // token. `role` and `forcePasswordChange` are still included purely as
  // coarse hints for middleware's route redirects and client-side nav.
  //
  // ORG-005 IW-11 corrective (login role projection): the coarse `role` hint is
  // sourced from the GOVERNED contextual role — the role bound to the user's
  // resolved Active Organisation Context in user_organisation_access — using the
  // SAME governed readers requireUser uses. It is NOT read from the scalar
  // users.role (removed by migration 175). This keeps the middleware projection
  // consistent with the authoritative governed enforcement (requireUser). When no
  // single Active Organisation Context resolves (e.g. multiple authorised
  // organisations with no valid remembered context), the hint is absent and
  // admin-only middleware routes correctly deny until a Current Organisation is
  // selected — requireUser remains the authoritative gate either way.
  const accessSet = await fetchActiveOrganisationAccess(user.id);
  const activeOrganisationId = accessSet
    ? resolveActiveContext(accessSet, user.remembered_organisation_id ?? null).activeOrganisationId
    : null;
  const contextualRole = activeOrganisationId
    ? await fetchContextualRole(user.id, activeOrganisationId)
    : null;

  const token = await signJwt({
    sub: user.id,
    // Coarse projection hint only (UserRole when a single context resolves, else
    // absent → admin-only routes deny). Never authority; requireUser re-derives it.
    role: contextualRole as UserRole,
    forcePasswordChange: user.force_password_change ?? false,
    // ORG-005 IW-9 — stamp the session-currency epoch so requireUser can detect
    // a later revocation (F058) or forced-change bump (F059).
    tv: user.token_version ?? 0,
  });

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("users")
    .update({
      last_login_at: now,
      // First successful login moves an invited account to active.
      status: user.status === "pending_invitation" ? "active" : user.status,
    })
    .eq("id", user.id);

  const response = NextResponse.json({
    user: {
      workEmail: user.work_email,
      firstName: user.first_name,
      lastName: user.last_name,
      // Governed contextual role (same source as the JWT hint above); the client
      // authoritative value still comes from /api/auth/me → requireUser.
      role: contextualRole,
    },
  });

  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION_SECONDS,
    path: "/",
  });

  return response;
}
