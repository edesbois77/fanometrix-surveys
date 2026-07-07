import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSession, signJwt, SESSION_COOKIE_NAME, SESSION_DURATION_SECONDS } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { password } = body;
  if (!password || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const hashed_password = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("users")
    .update({ hashed_password, force_password_change: false, password_changed_at: now })
    .eq("id", session.sub);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Issue a refreshed JWT with forcePasswordChange cleared. Role is
  // carried forward unchanged here purely as middleware's coarse routing
  // hint — the next API call re-fetches it live from the database
  // regardless (see lib/auth-server.ts).
  const newToken = await signJwt({
    sub: session.sub,
    role: session.role,
    forcePasswordChange: false,
  });

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, newToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   SESSION_DURATION_SECONDS,
    path:     "/",
  });

  return response;
}
