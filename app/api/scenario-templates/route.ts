// Powers the Templates tab of "Add to Showroom". Reads scenario_templates
// live — there is no hardcoded or duplicate copy of template data
// anywhere in the application (migration 082's own header comment makes
// the same point about the table itself).
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireUser(req);
  } catch (err) {
    return err as Response;
  }

  if (session.role !== "admin" && !session.canPresentSimulations) {
    return NextResponse.json({ error: "You don't have access to Product Walkthrough." }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("scenario_templates")
    .select("id, name, description, tags, source_config")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
