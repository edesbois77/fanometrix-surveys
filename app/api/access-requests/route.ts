// Public endpoint — no auth required.
// Accepts access request form submissions from /request-access.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const name         = (body.name         ?? "").trim();
  const email        = (body.email        ?? "").trim().toLowerCase();
  const organisation = (body.organisation ?? "").trim();
  const role         = (body.role         ?? "").trim();
  const message      = (body.message      ?? "").trim();

  if (!name)         return NextResponse.json({ error: "Name is required."         }, { status: 400 });
  if (!email)        return NextResponse.json({ error: "Email is required."        }, { status: 400 });
  if (!organisation) return NextResponse.json({ error: "Organisation is required." }, { status: 400 });

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("access_requests").insert({
    name, email, organisation,
    role:    role    || null,
    message: message || null,
  });

  if (error) {
    console.error("[access-requests] Insert error:", error.message);
    return NextResponse.json({ error: "Failed to submit request. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
