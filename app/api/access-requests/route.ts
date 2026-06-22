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

  // ── Email notification via Resend ────────────────────────────────────────────
  // Requires two Vercel environment variables:
  //   RESEND_API_KEY     — from resend.com → API Keys
  //   NOTIFICATION_EMAIL — the inbox you want access request alerts sent to
  // Non-fatal — request is already saved to DB; email failure won't break submission.
  const resendKey   = process.env.RESEND_API_KEY;
  const notifyEmail = process.env.NOTIFICATION_EMAIL;

  if (resendKey && notifyEmail) {
    try {
      await fetch("https://api.resend.com/emails", {
        method:  "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from:    "Fanometrix <onboarding@resend.dev>",
          to:      [notifyEmail],
          subject: `New Access Request — ${organisation}`,
          html: `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111;">
              <h2 style="color:#0B1929;margin-bottom:4px;">New Access Request</h2>
              <p style="color:#888;font-size:13px;margin-top:0;">Received via Fanometrix</p>
              <table style="width:100%;border-collapse:collapse;margin-top:24px;font-size:14px;">
                <tr><td style="padding:8px 0;color:#555;width:120px;">Name</td><td style="padding:8px 0;font-weight:600;">${name}</td></tr>
                <tr><td style="padding:8px 0;color:#555;">Email</td><td style="padding:8px 0;"><a href="mailto:${email}" style="color:#D7B87A;">${email}</a></td></tr>
                <tr><td style="padding:8px 0;color:#555;">Organisation</td><td style="padding:8px 0;">${organisation}</td></tr>
                <tr><td style="padding:8px 0;color:#555;">Role</td><td style="padding:8px 0;">${role || "—"}</td></tr>
                ${message ? `<tr><td style="padding:8px 0;color:#555;vertical-align:top;">Message</td><td style="padding:8px 0;">${message.replace(/\n/g, "<br>")}</td></tr>` : ""}
              </table>
              <div style="margin-top:32px;padding:16px;background:#f7f8fa;border-radius:8px;font-size:13px;color:#666;">
                Review in the <a href="https://fanometrix-surveys.vercel.app/access-requests" style="color:#0B1929;font-weight:600;">Fanometrix admin panel →</a>
              </div>
            </div>
          `,
        }),
      });
    } catch (err) {
      console.error("[access-requests] Resend notification failed:", err);
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
