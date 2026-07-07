import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { signJwt, SESSION_COOKIE_NAME, SESSION_DURATION_SECONDS } from "@/lib/auth";

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
  const token = await signJwt({
    sub: user.id,
    role: user.role,
    forcePasswordChange: user.force_password_change ?? false,
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
      role: user.role,
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
