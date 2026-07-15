import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ user: null });
  }

  // Live lookup rather than trusting the (identity-only) JWT, so the UI
  // reflects the user's current role/organisation/access scope, not
  // whatever was true when they last logged in.
  const { data: row } = await supabaseAdmin
    .from("users")
    .select("work_email, first_name, last_name, role, organisation_id, access_scope, status, can_present_simulations, organisations ( name, type )")
    .eq("id", session.sub)
    .single();

  if (!row || row.status !== "active") {
    return NextResponse.json({ user: null });
  }

  const org = Array.isArray(row.organisations) ? row.organisations[0] : row.organisations;

  return NextResponse.json({
    user: {
      workEmail: row.work_email,
      firstName: row.first_name,
      lastName: row.last_name,
      role: row.role,
      organisationId: row.organisation_id,
      organisationName: org?.name ?? null,
      organisationType: org?.type ?? null,
      accessScope: row.access_scope,
      canPresentSimulations: row.can_present_simulations,
    },
  });
}
