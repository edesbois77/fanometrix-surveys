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

  let query = supabaseAdmin.from("surveys").select("*").order("created_at", { ascending: false });

  // Non-admins only ever see surveys created by someone at their own
  // organisation — never another organisation's, never an admin-authored
  // one (organisation_id IS NULL for those). Dashboard/reporting data is
  // unaffected since it's scoped by campaign visibility, not this.
  if (session.role !== "admin") {
    if (!session.organisationId) return NextResponse.json({ data: [] });
    query = query.eq("organisation_id", session.organisationId);
  }

  const [{ data: surveys, error }, { data: stats }] = await Promise.all([
    query,
    supabaseAdmin.from("vw_survey_stats").select("*"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const statsMap = new Map(
    (stats ?? []).map((s: Record<string, unknown>) => [s.id as string, s])
  );

  const data = (surveys ?? []).map((s: Record<string, unknown>) => {
    const st = statsMap.get(s.id as string);
    return {
      ...s,
      campaign_count:      (st?.campaign_count      as number) ?? 0,
      live_campaign_count: (st?.live_campaign_count  as number) ?? 0,
      response_count:      (st?.response_count       as number) ?? 0,
      last_used_at:        (st?.last_used_at         as string | null) ?? null,
      last_response_at:    (st?.last_response_at     as string | null) ?? null,
    };
  });

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireUser(req, ["admin", "publisher"]);
  } catch (err) {
    return err as Response;
  }

  const body = await req.json();

  // Strip computed/lifecycle/identity fields — the DB owns these
  const {
    id: _id, created_at: _ca, updated_at: _ua,
    archived_at: _aa, deleted_at: _da, deleted_by: _db,
    delete_reason: _dr, created_by: _cb, organisation_id: _oid,
    campaign_count: _cc, live_campaign_count: _lcc, response_count: _rc,
    _action: _act,
    ...rest
  } = body;

  // Publisher accounts can only ever create surveys for their own
  // organisation — enforced here regardless of what the UI sent.
  const organisationId = session.role === "publisher" ? session.organisationId : null;

  const { data, error } = await supabaseAdmin
    .from("surveys")
    .insert([{ ...rest, created_by: session.workEmail, organisation_id: organisationId, updated_at: new Date().toISOString() }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
