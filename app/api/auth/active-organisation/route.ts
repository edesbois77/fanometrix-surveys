import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchActiveOrganisationAccess, canSwitchTo } from "@/lib/authz/organisation-access";

// ORG-005 · IW-1 — switch the caller's Active Organisation Context (Q-08).
// Sets the remembered/preferred organisation, validated against the LIVE
// User–Organisation Access set. An unauthorised target is rejected (403). No
// permission carries from the previous organisation — the next request
// re-resolves context live (lib/auth-server.ts). Fails closed if the access
// source is unavailable.
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser(req);
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
