import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";

const ORG_TYPES = ["publisher", "agency", "brand", "internal"] as const;

// GET is intentionally open to every authenticated role (not just admin) —
// Campaigns, Campaign Groups, and Research Projects all need this list to
// populate their Publisher/Brand/Agency pickers, including for publisher
// accounts. Only the mutating endpoints below stay admin-only.
export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireUser(req);
  } catch (err) {
    return err as Response;
  }

  if (session.role !== "admin") {
    const { data: orgs, error } = await supabaseAdmin
      .from("organisations")
      .select("id, name, type, status")
      .is("deleted_at", null)
      .order("name", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: orgs ?? [] });
  }

  const [{ data: orgs, error }, { data: users }] = await Promise.all([
    supabaseAdmin
      .from("organisations")
      .select("*")
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabaseAdmin.from("users").select("organisation_id"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const userCounts: Record<string, number> = {};
  for (const u of users ?? []) {
    if (!u.organisation_id) continue;
    userCounts[u.organisation_id] = (userCounts[u.organisation_id] ?? 0) + 1;
  }

  const data = (orgs ?? []).map(o => ({ ...o, user_count: userCounts[o.id] ?? 0 }));
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const body = await req.json();
  const name = (body.name ?? "").trim();
  const type = body.type;

  if (!name) {
    return NextResponse.json({ error: "Organisation name is required." }, { status: 400 });
  }
  if (!ORG_TYPES.includes(type)) {
    return NextResponse.json({ error: "A valid organisation type is required." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("organisations")
    .insert({ name, type })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "An organisation with this name already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { ...data, user_count: 0 } }, { status: 201 });
}
