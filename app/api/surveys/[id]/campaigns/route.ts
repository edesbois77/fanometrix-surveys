import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser(req);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;

  const [{ data: campaigns, error }, { data: stats }] = await Promise.all([
    supabaseAdmin
      .from("campaigns")
      .select("id, campaign_id, brand_org_id, publisher_org_id, campaign_name, status, start_date, end_date, created_at")
      .eq("survey_id", id)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("vw_campaign_stats")
      .select("campaign_id, response_count"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const orgIds = Array.from(new Set(
    (campaigns ?? []).flatMap(c => [c.brand_org_id, c.publisher_org_id]).filter((oid): oid is string => !!oid)
  ));
  const { data: orgs } = orgIds.length > 0
    ? await supabaseAdmin.from("organisations").select("id, name").in("id", orgIds)
    : { data: [] as { id: string; name: string }[] };
  const orgNameById = new Map((orgs ?? []).map(o => [o.id, o.name]));

  const statsMap = new Map(
    (stats ?? []).map((s: Record<string, unknown>) => [
      s.campaign_id as string,
      s.response_count as number,
    ])
  );

  const data = (campaigns ?? []).map(c => ({
    id: c.id,
    campaign_id: c.campaign_id,
    brand_name: c.brand_org_id ? orgNameById.get(c.brand_org_id) ?? "" : "",
    campaign_name: c.campaign_name,
    status: c.status,
    start_date: c.start_date,
    end_date: c.end_date,
    created_at: c.created_at,
    publisher: c.publisher_org_id ? orgNameById.get(c.publisher_org_id) ?? null : null,
    response_count: statsMap.get(c.campaign_id) ?? 0,
  }));

  return NextResponse.json({ data });
}
