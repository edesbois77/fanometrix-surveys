// Short-lived, campaign-scoped preview SESSION.
//
// WHY
// The review link carries its token in the URL fragment, and the embed strips
// that fragment immediately so it cannot leak. That leaves a refresh with no
// credential at all — measured: five hard refreshes rendered blank. A reviewer
// pressing F5 must not lose the preview, and must not be handed the raw grant
// token to keep either.
//
// So a successful exchange mints a session that is deliberately WEAKER than the
// grant it derives from:
//   • HttpOnly  — script cannot read it, so it cannot be exfiltrated from the
//                 page or copied into a shareable link.
//   • Scoped    — bound to ONE campaign slug; useless anywhere else.
//   • Short     — 30 minutes, and NEVER beyond the grant's own expiry.
//   • Checked   — every use re-resolves the grant, so revocation takes effect on
//                 the next request rather than when the session lapses.
//
// The raw grant token is never stored in localStorage, sessionStorage, or any
// readable cookie. This session is a signed assertion ABOUT a grant, not the
// grant itself: possessing it cannot reproduce a shareable link.
import { createHmac, timingSafeEqual } from "node:crypto";

export const PREVIEW_SESSION_COOKIE = "fx_preview_session";
/** Deliberately short. A reviewer refreshing gets continuity; a laptop left open
 *  in a shared office does not become a standing grant. */
export const PREVIEW_SESSION_MAX_SECONDS = 30 * 60;

type Payload = { g: string; c: string; e: number };

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET must be set to mint a preview session");
  return s;
}

const b64u = (b: Buffer) => b.toString("base64url");
const sign = (body: string) => b64u(createHmac("sha256", secret()).update(body).digest());

/**
 * Mint a session for a resolved grant.
 * `expiresAtIso` is the GRANT's expiry: the session can never outlive it, so a
 * grant that expires in 5 minutes yields a 5-minute session, not a 30-minute one.
 */
export function mintPreviewSession(grantId: string, campaignSlug: string, grantExpiresAtIso: string): { value: string; maxAgeSeconds: number } | null {
  const grantRemaining = Math.floor((new Date(grantExpiresAtIso).getTime() - Date.now()) / 1000);
  if (grantRemaining <= 0) return null;                       // already expired
  const maxAge = Math.min(PREVIEW_SESSION_MAX_SECONDS, grantRemaining);
  const payload: Payload = { g: grantId, c: campaignSlug, e: Math.floor(Date.now() / 1000) + maxAge };
  const body = b64u(Buffer.from(JSON.stringify(payload), "utf8"));
  return { value: `${body}.${sign(body)}`, maxAgeSeconds: maxAge };
}

/**
 * Verify signature, expiry and campaign scope. Returns the grant id the caller
 * must then RE-RESOLVE — this function deliberately does not decide access on
 * its own, so a revoked grant cannot be honoured by a still-valid session.
 */
export function verifyPreviewSession(cookieValue: string | null | undefined, campaignSlug: string): { grantId: string } | null {
  if (!cookieValue || typeof cookieValue !== "string") return null;
  const dot = cookieValue.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = cookieValue.slice(0, dot);
  const mac  = cookieValue.slice(dot + 1);
  const expected = sign(body);
  const a = Buffer.from(mac, "utf8"), b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: Payload;
  try { payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { return null; }
  if (!payload?.g || !payload?.c || !payload?.e) return null;
  if (payload.e * 1000 <= Date.now()) return null;            // session lapsed
  if (payload.c !== campaignSlug) return null;                // scoped to one campaign
  return { grantId: payload.g };
}

/** Cookie attributes. SameSite=None so the preview still works inside an
 *  iframe; the Deploy page's own inline preview is same-origin and does not
 *  depend on this at all, which is what keeps third-party-cookie blocking from
 *  breaking the authenticated surface. */
export function previewSessionCookie(value: string, maxAgeSeconds: number) {
  // SameSite=None is REJECTED by browsers unless Secure is also set, so the two
  // must move together. Production is HTTPS and gets None+Secure, which is what
  // lets the preview work inside an iframe. Local development over plain HTTP
  // falls back to Lax — top-level review still works there, and the Deploy
  // page's inline preview is same-origin and never depended on this cookie.
  const secure = process.env.NODE_ENV === "production";
  return {
    name: PREVIEW_SESSION_COOKIE,
    value,
    httpOnly: true,
    secure,
    sameSite: secure ? ("none" as const) : ("lax" as const),
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Immediate clearance, used when a session is presented but its grant no longer
 *  resolves — so a revoked link stops working AND stops re-presenting itself. */
export function clearedPreviewSessionCookie() {
  return { ...previewSessionCookie("", 0), maxAge: 0 };
}

/** A companion marker so the CLIENT can tell it is in a review context.
 *
 * The session cookie is HttpOnly by design, so script cannot read it — which
 * means a refreshed tab whose grant has just been revoked cannot tell whether it
 * is a failed review or ordinary production delivery, and falls back to a silent
 * blank frame. This marker carries NO credential: it is the literal string "1",
 * useless to an attacker, and exists only so the tab can show "Preview
 * unavailable" instead of nothing. It is cleared whenever the session is.
 */
export const PREVIEW_CONTEXT_COOKIE = "fx_preview_ctx";

export function previewContextCookie(maxAgeSeconds: number) {
  const secure = process.env.NODE_ENV === "production";
  return {
    name: PREVIEW_CONTEXT_COOKIE,
    value: "1",
    httpOnly: false,            // deliberately readable — it is not a credential
    secure,
    sameSite: secure ? ("none" as const) : ("lax" as const),
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function clearedPreviewContextCookie() {
  return { ...previewContextCookie(0), maxAge: 0 };
}
