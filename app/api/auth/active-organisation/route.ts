import { NextRequest, NextResponse } from "next/server";
import { requireIdentity } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchActiveOrganisationAccess, canSwitchTo } from "@/lib/authz/organisation-access";

// ORG-005 · IW-1 / ORG-006 · WP-01 — SELECT or SWITCH the caller's Current
// Organisation (Q-08). Sets the remembered/preferred Organisation, validated
// against the LIVE authoritative Accessible Organisation Set. Selection (from
// selection_required) and switching are the same governed operation: pick one
// Organisation the caller is authorised for.
//
// Authenticated via requireIdentity (identity only), NOT requireUser — a user in
// the selection_required state has no resolved Current Organisation yet, so they
// must be able to reach this endpoint to make the required selection.
//
// This changes Current/remembered context ONLY. It never grants or revokes
// Organisation access and never mutates user_organisation_access; an unauthorised
// target is rejected (403); no permission carries from the previous Organisation —
// the next request re-resolves context live. Fails closed if the source is
// unavailable (503).
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireIdentity(req);
  } catch (err) {
    return err as Response;
  }

  let body: { organisationId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const target = body.organisationId;
  if (!target) {
    return NextResponse.json({ error: "organisationId is required" }, { status: 400 });
  }

  const access = await fetchActiveOrganisationAccess(user.id);
  if (access === null) {
    // Source unavailable → fail closed (do not switch on indeterminate access).
    return NextResponse.json({ error: "Organisation access is temporarily unavailable." }, { status: 503 });
  }
  if (!canSwitchTo(access, target)) {
    return NextResponse.json({ error: "You are not authorised to use that organisation." }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from("users")
    .update({ remembered_organisation_id: target })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ activeOrganisationId: target });
}
