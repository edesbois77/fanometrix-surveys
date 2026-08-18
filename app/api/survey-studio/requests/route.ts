import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { brandAgencyRefError, type OrgRefRow } from "@/lib/survey-validation";
import {
  buildRequestRecord,
  validateRequestRecord,
  requestVisibleTo,
  buildRequestNotificationEmail,
} from "@/lib/research-request";
import { sendInternalNotification } from "@/lib/notification-email";

// ── Survey Studio — Request intake (list + submit) ───────────────────────────
// GET  → the Current Organisation's research requests (newest first).
// POST → submit a commissioned research BRIEF. Submitting persists an intake
//        record ONLY (never a Survey/Campaign/Deploy) and fires a NON-FATAL
//        internal notification email (the persisted record stays authoritative
//        even if the email fails). Both are strictly Current-Organisation scoped.

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireUser(req);
  } catch (err) {
    return err as Response;
  }

  let query = supabaseAdmin.from("research_requests").select("*").order("created_at", { ascending: false });
  if (session.role !== "admin") {
    if (!session.organisationId) return NextResponse.json({ data: [] });
    query = query.eq("organisation_id", session.organisationId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  let session;
  try {
    // Product Access (Q-09): Request is a SHARED-tier product area — every
    // authenticated organisation user (Agency, Brand, Publisher, admin) may
    // commission research, per the settled V1 Product Blueprint. This is a
    // Product ACCESS decision, NOT a Product Capability, so there is no new
    // capability: `requireUser(req)` (authenticated + Active Organisation) is the
    // shared tier. The prior ["admin","publisher"] gate was an incidental
    // admin-and-publisher restriction that contradicted the contract. Data/results
    // access remains separately governed by the `data` entitlement authority.
    session = await requireUser(req);
  } catch (err) {
    return err as Response;
  }

  const body = await req.json().catch(() => ({}));

  // Shape the brief + the DERIVED requester identity. Organisation, requester,
  // status and the commissioned purpose all come from the server — never the body.
  const record = buildRequestRecord(body, {
    organisationId: session.organisationId,
    organisationName: session.organisationName,
    workEmail: session.workEmail,
    firstName: session.firstName,
    lastName: session.lastName,
  });
  if (!record) {
    return NextResponse.json({ error: "No current organisation is selected for your account." }, { status: 400 });
  }

  const errors = validateRequestRecord(record);
  if (errors.length) {
    return NextResponse.json({ error: errors[0], errors, code: "invalid_request" }, { status: 400 });
  }

  // Brand/Agency attribution (if any real governed id survived shaping — the
  // "Other / Not listed" sentinel is already null) must resolve to a real,
  // non-deleted org of the correct type. The org names are reused for the email.
  const orgNameById = new Map<string, string>();
  {
    const ids = [record.brand_org_id, record.agency_org_id].filter((v): v is string => typeof v === "string" && v !== "");
    if (ids.length) {
      const { data: refRows } = await supabaseAdmin.from("organisations").select("id, name, type, deleted_at").in("id", ids);
      const rows = (refRows ?? []) as Array<OrgRefRow & { name: string }>;
      for (const r of rows) orgNameById.set(r.id, r.name);
      const refErr = brandAgencyRefError(record.brand_org_id, record.agency_org_id, rows as OrgRefRow[]);
      if (refErr) return NextResponse.json({ error: refErr, code: "invalid_org_reference" }, { status: 400 });
    }
  }

  // Persist FIRST — this is the authoritative outcome.
  const { data, error } = await supabaseAdmin.from("research_requests").insert([record]).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!requestVisibleTo(data, session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Internal notification — NON-FATAL by contract. A send failure/skip must never
  // lose a successfully saved request; it only logs (matching access_requests).
  try {
    const otherMarkets = typeof body?.otherMarkets === "string" && body.otherMarkets.trim() ? body.otherMarkets.trim() : null;
    const email = buildRequestNotificationEmail({
      id: data.id,
      name: record.name,
      requesterName: record.requester_name,
      requesterEmail: record.requester_email,
      organisationName: session.organisationName,
      brandName: record.brand_org_id ? orgNameById.get(record.brand_org_id) ?? null : null,
      agencyName: record.agency_org_id ? orgNameById.get(record.agency_org_id) ?? null : null,
      markets: record.markets,
      otherMarkets,
      objective: record.objective,
      audience: record.audience,
      desiredLaunchDate: record.desired_launch_date,
      desiredResponses: record.desired_responses,
      additionalContext: record.additional_context,
    });
    const result = await sendInternalNotification(email);
    if (!result.ok && !result.skipped) {
      console.error("[survey-studio/requests] notification email failed:", result.error);
    }
  } catch (err) {
    console.error("[survey-studio/requests] notification email threw:", err);
  }

  return NextResponse.json({ data }, { status: 201 });
}
