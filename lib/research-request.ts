// ── Survey Studio — Request (research intake) domain logic ───────────────────
// Pure, DB-free logic for the Request → Create → Deploy → Discover lifecycle's
// FIRST step: capturing a commissioned research BRIEF and, once accepted, seeding
// a Survey Studio Create survey from it.
//
// Request is INHERENTLY COMMISSIONED research — it exists specifically for work
// run "for an advertiser, sponsor, client or agency". Publishers with normal
// Create access build their own editorial/product/business surveys directly in
// Create; anything third-party routes here. So the requester never picks a
// Purpose — it is implied by entering this workflow, and every Request stores the
// commissioned (third-party) purpose value the downstream Survey hand-off needs.
//
// It reuses the platform's existing models:
//   • the governed country list (lib/countries) for Market(s);
//   • the governed Purpose taxonomy (lib/survey-purpose) — fixed to commissioned;
//   • the SAME organisations(id) Brand/Agency attribution columns Surveys use;
//   • surveys.about's shape, so the hand-off is a direct field copy.
//
// This module owns NO persistence and NO authorisation — the route wires these
// pure helpers to supabaseAdmin + requireUser(). Keeping the shaping/mapping/
// guard logic here makes the attribution contract, the hand-off, and the
// notification content testable without a database.

import { COUNTRIES } from "@/lib/countries";
import { isPurposeValue, type PurposeValue } from "@/lib/survey-purpose";

/** The single Purpose every Request carries — commissioned / third-party. */
export const COMMISSIONED_PURPOSE: PurposeValue = "third_party";

/** Sentinel a Brand/Agency selector uses for "Other / Not listed". It NEVER
 *  reaches persistence: the shaping layer coerces it to null (no fake org id). */
export const OTHER_ORG_VALUE = "__other__";

// ── Status lifecycle ─────────────────────────────────────────────────────────
export const REQUEST_STATUSES = ["submitted", "accepted", "needs_clarification", "declined"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export function isRequestStatus(v: unknown): v is RequestStatus {
  return typeof v === "string" && (REQUEST_STATUSES as readonly string[]).includes(v);
}

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  submitted:           "Submitted",
  accepted:            "Accepted",
  needs_clarification: "Needs clarification",
  declined:            "Declined",
};

// ── Governed markets ─────────────────────────────────────────────────────────
const GOVERNED_MARKET_CODES = new Set(COUNTRIES.map((c) => c.code));

/**
 * Keep only governed country codes (from lib/countries), de-duplicated and in the
 * canonical COUNTRIES display order. A client can post anything; markets must be
 * governed values, never a free-text list — same guarantee Create's chips give.
 */
export function sanitiseMarkets(markets: unknown): string[] {
  if (!Array.isArray(markets)) return [];
  const seen = new Set<string>();
  for (const m of markets) if (typeof m === "string" && GOVERNED_MARKET_CODES.has(m)) seen.add(m);
  return COUNTRIES.map((c) => c.code).filter((code) => seen.has(code));
}

/** Governed code → display name (used for detail/email rendering). */
export function marketName(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

// ── Commissioned attribution ─────────────────────────────────────────────────
/** A governed brand/agency id, or null. "", the "Other / Not listed" sentinel,
 *  and non-strings all coerce to null — a fake "Other" id is never persisted. */
function cleanOrgId(v: unknown): string | null {
  if (typeof v !== "string" || v === "" || v === OTHER_ORG_VALUE) return null;
  return v;
}

/**
 * The Brand/Agency ids to persist for a given Purpose. Attribution is retained
 * ONLY for the commissioned (third-party) Purpose. Since Request is always
 * commissioned, both ids flow through — but each is coerced to a real governed id
 * or null (never the "Other" sentinel, never a blank). This is also the rule the
 * hand-off reuses so a first-party survey can never carry attribution.
 */
export function commissionedAttributionFor(
  purpose: unknown,
  brandOrgId: unknown,
  agencyOrgId: unknown,
): { brand_org_id: string | null; agency_org_id: string | null } {
  if (!isPurposeValue(purpose) || purpose !== COMMISSIONED_PURPOSE) {
    return { brand_org_id: null, agency_org_id: null };
  }
  return { brand_org_id: cleanOrgId(brandOrgId), agency_org_id: cleanOrgId(agencyOrgId) };
}

// ── Requester identity (derived, never re-asked) ─────────────────────────────
export type RequesterIdentity = {
  organisationId: string | null;
  organisationName?: string | null;
  workEmail: string;
  firstName: string | null;
  lastName: string | null;
};

export function requesterDisplayName(id: { firstName: string | null; lastName: string | null }): string | null {
  const name = [id.firstName, id.lastName].filter((p) => p && p.trim()).join(" ").trim();
  return name || null;
}

// ── Other-market briefing ────────────────────────────────────────────────────
// A market not in the governed list is BRIEFING CONTEXT, not a governed code. It
// is folded into additional_context (labelled) so it is preserved for Fanometrix
// review and can never leak into Survey.about.markets. No schema, no fake code.
const trimOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function composeAdditionalContext(additionalContext: unknown, otherMarkets: unknown): string | null {
  const other = trimOrNull(otherMarkets);
  const ctx = trimOrNull(additionalContext);
  const parts = [
    other ? `Requested market(s) not in our list: ${other}` : null,
    ctx,
  ].filter((p): p is string => !!p);
  return parts.length ? parts.join("\n\n") : null;
}

// ── The submitted brief (client → server) ────────────────────────────────────
export type RequestBriefInput = {
  name?: unknown;
  objective?: unknown;
  audience?: unknown;
  markets?: unknown;
  brandOrgId?: unknown;
  agencyOrgId?: unknown;
  desiredLaunchDate?: unknown;
  desiredResponses?: unknown;
  additionalContext?: unknown;
  otherMarkets?: unknown;
};

export type NewRequestRecord = {
  organisation_id: string;
  status: RequestStatus;
  name: string | null;
  objective: string | null;
  audience: string | null;
  markets: string[];
  purpose: PurposeValue;
  brand_org_id: string | null;
  agency_org_id: string | null;
  desired_launch_date: string | null;
  desired_responses: number | null;
  additional_context: string | null;
  requester_email: string;
  requester_name: string | null;
};

function positiveIntOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isoDateOrNull(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : v;
}

/**
 * Shape a submitted brief + the authenticated requester into the row to insert.
 * Every governance rule lives here: markets governed, purpose FIXED to
 * commissioned (never taken from the body — Request is inherently third-party),
 * attribution only via real governed ids ("Other" → null), requester derived (not
 * trusted from the body), status the initial 'submitted', and any Other-market
 * text folded into additional_context. The organisation is the requester's
 * Current Organisation — a client can never set it.
 *
 * Returns null when there is no Current Organisation (the request can't be scoped).
 */
export function buildRequestRecord(input: RequestBriefInput, requester: RequesterIdentity): NewRequestRecord | null {
  if (!requester.organisationId) return null;
  const attribution = commissionedAttributionFor(COMMISSIONED_PURPOSE, input.brandOrgId, input.agencyOrgId);
  return {
    organisation_id: requester.organisationId,
    status: "submitted",
    name: trimOrNull(input.name),
    objective: trimOrNull(input.objective),
    audience: trimOrNull(input.audience),
    markets: sanitiseMarkets(input.markets),
    purpose: COMMISSIONED_PURPOSE,
    brand_org_id: attribution.brand_org_id,
    agency_org_id: attribution.agency_org_id,
    desired_launch_date: isoDateOrNull(input.desiredLaunchDate),
    desired_responses: positiveIntOrNull(input.desiredResponses),
    additional_context: composeAdditionalContext(input.additionalContext, input.otherMarkets),
    requester_email: requester.workEmail,
    requester_name: requesterDisplayName(requester),
  };
}

export function validateRequestRecord(rec: NewRequestRecord): string[] {
  const errors: string[] = [];
  if (!rec.name) errors.push("A short research name is required.");
  if (!rec.objective) errors.push("An objective is required — tell us what you want to understand.");
  return errors;
}

// ── Scoping (Current-Organisation) ───────────────────────────────────────────
export function requestVisibleTo(
  row: { organisation_id: string | null },
  principal: { role: string; organisationId: string | null },
): boolean {
  if (principal.role === "admin") return true;
  return !!principal.organisationId && row.organisation_id === principal.organisationId;
}

// ── Hand-off: accepted Request → Survey Studio Create ────────────────────────
export type RequestForHandoff = {
  id: string;
  status: string;
  survey_id: string | null;
  organisation_id: string | null;
  name: string | null;
  objective: string | null;
  audience: string | null;
  markets: unknown;
  brand_org_id: string | null;
  agency_org_id: string | null;
};

export function handoffEligibility(row: Pick<RequestForHandoff, "status" | "survey_id">):
  { ok: true } | { ok: false; reason: "not_accepted" | "already_created" } {
  if (row.survey_id) return { ok: false, reason: "already_created" };
  if (row.status !== "accepted") return { ok: false, reason: "not_accepted" };
  return { ok: true };
}

/**
 * Build the Survey insert payload that seeds Create from an accepted Request.
 * Copies ONLY compatible About fields, forces the commissioned Purpose (Request is
 * inherently third-party, so the requester never chose one), transfers ONLY
 * governed markets, and copies Brand/Agency by STABLE ID (never display text, never
 * an "Other" sentinel). Other-market briefing text stays in the Request and never
 * becomes a Survey market. The resulting Survey is a normal draft; Create owns it.
 *
 * organisation_id is intentionally OMITTED — the survey-creation path sets it from
 * the requesting organisation, not from this payload.
 */
export function buildSurveyFromRequest(row: RequestForHandoff): Record<string, unknown> {
  const attribution = commissionedAttributionFor(COMMISSIONED_PURPOSE, row.brand_org_id, row.agency_org_id);
  return {
    name: row.name?.trim() || "Untitled survey",
    status: "draft",
    about: {
      objective: row.objective ?? null,
      audience: row.audience ?? null,
      markets: sanitiseMarkets(row.markets),
      purpose: COMMISSIONED_PURPOSE,
    },
    brand_org_id: attribution.brand_org_id,
    agency_org_id: attribution.agency_org_id,
  };
}

// ── Internal notification content (pure) ─────────────────────────────────────
// Builds the internal-alert email body for a submitted Request. Pure so its
// content is unit-testable; the transport (Resend) lives in lib/notification-email.
// Only actionable brief fields are included — no internal/technical-only fields.
export type RequestNotificationFields = {
  id: string;
  name: string | null;
  requesterName: string | null;
  requesterEmail: string;
  organisationName: string | null;
  brandName: string | null;
  agencyName: string | null;
  markets: string[];
  otherMarkets: string | null;
  objective: string | null;
  audience: string | null;
  desiredLaunchDate: string | null;
  desiredResponses: number | null;
  additionalContext: string | null;
  /** Optional deep link into the internal review view. */
  link?: string | null;
};

// ── Clarification workflow (Manage → Requests) ───────────────────────────────
// "Needs clarification" is a CONTACT action, not a bare status flip: an admin
// writes a message, it is emailed to the requester, and only then does the Request
// move to 'needs_clarification'. These pure helpers make the message validation,
// the email content, and the persisted audit fields testable without a database.

/** The statuses the plain PATCH route may set directly. 'needs_clarification' is
 *  DELIBERATELY excluded — it must go through the clarify endpoint (which sends the
 *  email), so there is only ONE way to reach it (no statusless clarification). */
export function isDirectlyPatchableStatus(status: unknown): status is "accepted" | "declined" {
  return status === "accepted" || status === "declined";
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Validate the admin's clarification message. Non-empty (after trimming) is the
 *  only V1 rule. Returns an error string, or null when valid. */
export function validateClarificationMessage(message: unknown): string | null {
  if (typeof message !== "string" || !message.trim()) return "A clarification message is required.";
  return null;
}

/** First name for the email greeting — first whitespace-delimited token of the
 *  stored requester name, or a neutral fallback. */
export function firstNameOf(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || "there";
}

/** The Request fields the clarification email reads. The recipient is ALWAYS the
 *  stored requester_email — never client-supplied. */
export type RequestForClarification = {
  name: string | null;
  requester_name: string | null;
  requester_email: string;
};

/**
 * Build the clarification email addressed to the stored requester. `to` comes from
 * the record, so a client cannot redirect it. Professional Fanometrix copy.
 */
export function buildClarificationEmail(row: RequestForClarification, message: string):
  { to: string; subject: string; html: string; text: string } {
  const requestName = row.name || "your research request";
  const subject = `More information needed: ${row.name || "your research request"}`;
  const msg = message.trim();
  const text =
    `Hi ${firstNameOf(row.requester_name)},\n\n` +
    `Thanks for submitting "${requestName}".\n\n` +
    `We need a little more information before we can progress the research request:\n\n` +
    `${msg}\n\n` +
    `Please reply to this email with the additional information.\n\n` +
    `Thanks,\nFanometrix`;
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#111;">` +
    `<p>Hi ${esc(firstNameOf(row.requester_name))},</p>` +
    `<p>Thanks for submitting &ldquo;${esc(requestName)}&rdquo;.</p>` +
    `<p>We need a little more information before we can progress the research request:</p>` +
    `<blockquote style="margin:12px 0;padding:8px 14px;border-left:3px solid #D7B87A;color:#333;">${esc(msg).replace(/\n/g, "<br/>")}</blockquote>` +
    `<p>Please reply to this email with the additional information.</p>` +
    `<p>Thanks,<br/>Fanometrix</p></div>`;
  return { to: row.requester_email, subject, html, text };
}

/** The audit patch written to research_requests once the clarification email has
 *  been sent: the message, when, who — plus the status transition and reviewed_*. */
export function buildClarificationPatch(message: string, requestedByEmail: string, nowIso: string): {
  status: "needs_clarification";
  clarification_message: string;
  clarification_requested_at: string;
  clarification_requested_by: string;
  reviewed_at: string;
  reviewed_by: string;
  updated_at: string;
} {
  return {
    status: "needs_clarification",
    clarification_message: message.trim(),
    clarification_requested_at: nowIso,
    clarification_requested_by: requestedByEmail,
    reviewed_at: nowIso,
    reviewed_by: requestedByEmail,
    updated_at: nowIso,
  };
}

export function buildRequestNotificationEmail(f: RequestNotificationFields): { subject: string; html: string; text: string } {
  const marketLabel = f.markets.length ? f.markets.map(marketName).join(", ") : "—";
  const rows: Array<[string, string | null]> = [
    ["Research name", f.name],
    ["Requester", f.requesterName],
    ["Requester email", f.requesterEmail],
    ["Organisation", f.organisationName],
    ["Brand / Client", f.brandName],
    ["Agency", f.agencyName],
    ["Markets", marketLabel],
    ["Other market(s)", f.otherMarkets],
    ["Objective", f.objective],
    ["Ideal audience", f.audience],
    ["Desired launch", f.desiredLaunchDate],
    ["Desired responses", f.desiredResponses != null ? String(f.desiredResponses) : null],
    ["Additional context", f.additionalContext],
    ["Request ID", f.id],
  ];
  const present = rows.filter(([, v]) => v != null && v !== "");
  const htmlRows = present
    .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#555;vertical-align:top;white-space:nowrap;">${esc(k)}</td><td style="padding:6px 0;color:#111;">${esc(String(v)).replace(/\n/g, "<br/>")}</td></tr>`)
    .join("");
  const linkHtml = f.link ? `<p style="margin-top:16px;"><a href="${esc(f.link)}" style="color:#8A6D2F;font-weight:600;">Review this request →</a></p>` : "";
  const subject = `New research request: ${f.name || "Untitled"}${f.organisationName ? ` — ${f.organisationName}` : ""}`;
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;">` +
    `<h2 style="margin:0 0 12px;">New research request</h2>` +
    `<table style="border-collapse:collapse;">${htmlRows}</table>${linkHtml}</div>`;
  const text = present.map(([k, v]) => `${k}: ${v}`).join("\n") + (f.link ? `\n\nReview: ${f.link}` : "");
  return { subject, html, text };
}
