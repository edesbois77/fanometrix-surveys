import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/auth";

// ── POST — public, submit access request form ─────────────────────────────────
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

  // ── Forward to Formcarry for email notification ───────────────────────────────
  // Add FORMCARRY_URL to Vercel environment variables.
  // In your Formcarry account, create a new form for Fanometrix and paste the
  // endpoint URL (e.g. https://formcarry.com/s/YOUR_FORM_ID) as FORMCARRY_URL.
  // Non-fatal — request is already saved to DB; Formcarry failure won't break submission.
  const formcarryUrl = process.env.FORMCARRY_URL;

  if (formcarryUrl) {
    try {
      const fd = new URLSearchParams({
        name,
        email,
        company:  organisation,
        type:     role || "Other",
        message:  message || "",
        source:   "fanometrix-request-access",
      });
      await fetch(formcarryUrl, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: fd.toString(),
      });
    } catch (err) {
      console.error("[access-requests] Formcarry notification failed:", err);
    }
  }

  return NextResponse.json({ success: true }, { status: 201 });
}

// ── GET — admin only, list all requests ──────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    await requireSession(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { data, error } = await supabaseAdmin
    .from("access_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
