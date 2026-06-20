import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  signJwt,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { username, password } = body;
  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required" },
      { status: 400 }
    );
  }

  const { data: user, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("username", username.toLowerCase().trim())
    .eq("is_active", true)
    .single();

  // Use a constant-time comparison even on not-found to avoid timing attacks
  const DUMMY_HASH =
    "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
  const hashToCheck = user?.hashed_password ?? DUMMY_HASH;
  const passwordMatch = await bcrypt.compare(password, hashToCheck);

  if (error || !user || !passwordMatch) {
    return NextResponse.json(
      { error: "Invalid username or password" },
      { status: 401 }
    );
  }

  const token = await signJwt({
    sub:                 user.id,
    username:            user.username,
    role:                user.role,
    organisationName:    user.organisation_name    ?? null,
    allowedCampaignIds:  user.allowed_campaign_ids  ?? [],
    allowedPublisherIds: user.allowed_publisher_ids ?? [],
    forcePasswordChange: user.force_password_change ?? false,
  });

  const response = NextResponse.json({
    user: {
      username: user.username,
      role: user.role,
      organisationName: user.organisation_name,
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
