import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import {
  requestVisibleTo,
  validateClarificationMessage,
  buildClarificationEmail,
  buildClarificationPatch,
} from "@/lib/research-request";
import { sendEmail } from "@/lib/notification-email";

// ── Survey Studio — Request clarification (the authoritative needs_clarification path) ─
// The ONLY way a Request reaches 'needs_clarification'. An admin's message is
// EMAILED to the stored requester first; only once the email is sent does the
// Request transition and record the clarification (message / when / who).
//
// ORDER OF OPERATIONS (sending the email is the PURPOSE of the action):
//   1. Validate the message (non-empty) and scope (admin, request exists).
//   2. Send the email to the STORED requester_email (never client input), with
//      Reply-To = NOTIFICATION_EMAIL so replies reach the Fanometrix inbox (the
//      `from` is the Resend dev sender — a production config item).
//   3. Only if the email succeeded, persist the audit fields + flip the status.
// So: email fails → no status change (nobody is falsely shown as contacted);
// persistence fails after a successful send → 500 surfaced, status not advanced
// (a retry re-sends — an accepted, small V1 duplicate window).

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    // Requesting clarification is a Fanometrix (admin) review action.
    session = await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const message = typeof body?.message === "string" ? body.message : "";

  const invalid = validateClarificationMessage(message);
  if (invalid) return NextResponse.json({ error: invalid, code: "invalid_clarification" }, { status: 400 });

  // Load the full request — the requester email comes from HERE, not the body.
  const { data: request } = await supabaseAdmin.from("research_requests").select("*").eq("id", id).single();
  if (!request) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  if (!requestVisibleTo(request, session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!request.requester_email) {
    return NextResponse.json({ error: "This request has no requester email on file.", code: "no_recipient" }, { status: 422 });
  }

  // 2. Send FIRST. Reply-To = NOTIFICATION_EMAIL (existing configured inbox) so the
  //    requester's reply reaches Fanometrix despite the dev `from` address.
  const email = buildClarificationEmail(
    { name: request.name, requester_name: request.requester_name, requester_email: request.requester_email },
    message,
  );
  const sent = await sendEmail({ ...email, replyTo: process.env.NOTIFICATION_EMAIL });
  if (!sent.ok) {
    const reason = sent.skipped
      ? "Email isn't configured, so the clarification could not be sent. The request was left unchanged."
      : "The clarification email could not be sent, so the request was left unchanged. Please try again.";
    return NextResponse.json({ error: reason, code: sent.skipped ? "email_unconfigured" : "email_failed" }, { status: 502 });
  }

  // 3. Only now persist the audit trail + transition.
  const patch = buildClarificationPatch(message, session.workEmail, new Date().toISOString());
  const { data, error } = await supabaseAdmin.from("research_requests").update(patch).eq("id", id).select().single();
  if (error) {
    // Emailed but not recorded — do NOT claim success; surface it (rare).
    return NextResponse.json(
      { error: "The clarification was emailed but could not be recorded. Please retry.", code: "record_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ data });
}
