// ── Internal notification email — the shared, trusted form-mail path ─────────
// Reuses the EXISTING Fanometrix form-notification mechanism (Resend), the same
// provider/config the public "Request Access" form uses in
// app/api/access-requests/route.ts:
//   • RESEND_API_KEY     — Resend API key
//   • NOTIFICATION_EMAIL — the internal Fanometrix inbox
//   • from: "Fanometrix <onboarding@resend.dev>"
// This is NOT a new provider or a one-off SMTP integration — it is the one place
// that transport is expressed, so every form alert stays consistent.
//
// `sendEmail` is the general primitive (arbitrary recipient + optional Reply-To);
// `sendInternalNotification` is the thin wrapper that targets NOTIFICATION_EMAIL
// (used by the new-request alert). Both are NON-THROWING and return a result.
//
// PRODUCTION CONFIG CAVEAT: `from` is the Resend dev sender onboarding@resend.dev,
// which is not a replyable Fanometrix domain address. For mail where the recipient
// may reply (e.g. a clarification request to a requester), pass Reply-To so replies
// reach a real inbox — callers use NOTIFICATION_EMAIL. Setting a verified Fanometrix
// `from` domain remains a production configuration item.

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const FROM_ADDRESS = "Fanometrix <onboarding@resend.dev>";

export type NotificationResult = { ok: boolean; skipped?: boolean; error?: string };

/** Injectable dependencies (tests supply these; production reads env + global fetch). */
export type NotificationDeps = {
  apiKey?: string | undefined;
  fetchImpl?: typeof fetch;
};

export type EmailMessage = {
  to: string | undefined;
  subject: string;
  html: string;
  text?: string;
  /** Optional Reply-To so a recipient's reply reaches a real inbox despite the dev `from`. */
  replyTo?: string | null;
};

/**
 * Send one email via Resend. NON-FATAL by contract — never throws. Missing API key
 * or recipient is a clean skip (ok:false, skipped:true), a transport/HTTP failure
 * is a non-fatal error (ok:false, error). Callers decide what a failure means for
 * their record (an internal alert tolerates it; a clarification email gates on it).
 */
export async function sendEmail(msg: EmailMessage, deps: NotificationDeps = {}): Promise<NotificationResult> {
  const apiKey = deps.apiKey ?? process.env.RESEND_API_KEY;
  const doFetch = deps.fetchImpl ?? fetch;

  if (!apiKey || !msg.to) return { ok: false, skipped: true };

  const payload: Record<string, unknown> = {
    from: FROM_ADDRESS,
    to: [msg.to],
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
  };
  if (msg.replyTo) payload.reply_to = msg.replyTo;

  try {
    const res = await doFetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, error: `resend_status_${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "send_failed" };
  }
}

/**
 * Send an internal alert to NOTIFICATION_EMAIL (the Fanometrix inbox). Thin wrapper
 * over sendEmail; used by the new-request submission alert. Missing config skips.
 */
export async function sendInternalNotification(
  msg: { subject: string; html: string; text?: string },
  deps: NotificationDeps & { to?: string | undefined } = {},
): Promise<NotificationResult> {
  const to = deps.to ?? process.env.NOTIFICATION_EMAIL;
  return sendEmail({ to, subject: msg.subject, html: msg.html, text: msg.text }, deps);
}
