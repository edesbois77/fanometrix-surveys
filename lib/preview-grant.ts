// Campaign preview grants — secure, scoped, revocable review links.
//
// The Deploy page offers a link shareable with ad-ops, so it cannot depend on
// the recipient holding a Fanometrix login cookie. It must equally not re-open
// draft research instruments to anyone holding a campaign slug.
//
// A grant is an opaque high-entropy token bound to exactly ONE campaign. Only
// its SHA-256 is stored, so reading the table cannot reproduce a working link.
// Campaign, survey and organisation are re-resolved from the grant on every use
// and are NEVER taken from values supplied alongside the token.
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

/** 32 random bytes → 43-char base64url. ~256 bits; not guessable, not enumerable. */
export function generatePreviewToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Storage form. The token itself is returned once at creation and never stored. */
export function hashPreviewToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time hash comparison, for callers that compare two hashes directly. */
export function hashesMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;   // length alone leaks nothing here
  return timingSafeEqual(ab, bb);
}

/** A token is base64url and fixed length. Reject anything else before touching
 *  the database, so malformed input cannot become a lookup. */
export function isWellFormedToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export const DEFAULT_GRANT_TTL_DAYS = 14;

export type PreviewGrant = {
  id: string;
  campaignId: string;
  surveyId: string | null;
  organisationId: string | null;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
};

export type GrantResolution =
  | { ok: true; grant: PreviewGrant; campaignSlug: string }
  | { ok: false; reason: "malformed" | "unknown" | "expired" | "revoked" | "campaign_deleted" | "mismatch" };

/**
 * Resolve a presented token to its grant, or fail closed.
 *
 * Every failure returns the same shape and the caller must render nothing —
 * missing, expired, revoked, malformed and mismatched grants are all "no
 * content". The reason is for server-side logging only; it is never surfaced to
 * the caller, so a probe cannot distinguish "no such grant" from "expired".
 *
 * `expectedCampaignSlug`, when given, is checked against the slug resolved FROM
 * the grant. It is a consistency check on a URL that carries both, never a
 * source of authority: the grant decides which campaign is served.
 */
export async function resolvePreviewGrant(
  token: unknown,
  expectedCampaignSlug?: string | null,
): Promise<GrantResolution> {
  if (!isWellFormedToken(token)) return { ok: false, reason: "malformed" };

  const { data, error } = await supabaseAdmin
    .from("campaign_preview_grants")
    .select("id, campaign_id, survey_id, organisation_id, expires_at, created_at, revoked_at, last_used_at, use_count")
    .eq("token_hash", hashPreviewToken(token))
    .maybeSingle();
  if (error || !data) return { ok: false, reason: "unknown" };

  if (data.revoked_at) return { ok: false, reason: "revoked" };
  if (new Date(data.expires_at as string).getTime() <= Date.now()) return { ok: false, reason: "expired" };

  // Re-resolve the campaign from the GRANT, never from the request.
  const { data: campaign } = await supabaseAdmin
    .from("campaigns")
    .select("id, campaign_id, survey_id, deleted_at")
    .eq("id", data.campaign_id as string)
    .maybeSingle();
  if (!campaign || campaign.deleted_at) return { ok: false, reason: "campaign_deleted" };

  // A grant is frozen to the survey the campaign carried at creation. If the
  // campaign has since been re-pointed, the grant does not silently widen to
  // different content.
  if (data.survey_id && campaign.survey_id && data.survey_id !== campaign.survey_id) {
    return { ok: false, reason: "mismatch" };
  }
  if (expectedCampaignSlug && expectedCampaignSlug !== campaign.campaign_id) {
    return { ok: false, reason: "mismatch" };
  }

  return {
    ok: true,
    campaignSlug: campaign.campaign_id as string,
    grant: {
      id: data.id as string,
      campaignId: data.campaign_id as string,
      surveyId: (data.survey_id as string | null) ?? null,
      organisationId: (data.organisation_id as string | null) ?? null,
      expiresAt: data.expires_at as string,
      createdAt: data.created_at as string,
      revokedAt: (data.revoked_at as string | null) ?? null,
      lastUsedAt: (data.last_used_at as string | null) ?? null,
      useCount: (data.use_count as number) ?? 0,
    },
  };
}

/** Best-effort usage marker. Never fatal — a preview must not fail because an
 *  audit counter could not be written. */
export async function markGrantUsed(grantId: string): Promise<void> {
  try {
    const { data } = await supabaseAdmin
      .from("campaign_preview_grants").select("use_count").eq("id", grantId).maybeSingle();
    await supabaseAdmin
      .from("campaign_preview_grants")
      .update({ last_used_at: new Date().toISOString(), use_count: ((data?.use_count as number) ?? 0) + 1 })
      .eq("id", grantId);
  } catch { /* non-fatal by design */ }
}

/** Strip a preview token from any string bound for a log. Applied to URLs we
 *  emit ourselves; platform access logs are outside our control and are the
 *  reason the token is also accepted as a header. */
export function redactPreviewToken(text: string): string {
  return text
    .replace(/([?&]preview_token=)[A-Za-z0-9_-]+/g, "$1[REDACTED]")
    .replace(/(x-fx-preview-token:\s*)[A-Za-z0-9_-]+/gi, "$1[REDACTED]");
}
