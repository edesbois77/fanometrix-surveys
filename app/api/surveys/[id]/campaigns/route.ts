import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(req);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;

  const [{ data: campaigns, error }, { data: stats }] = await Promise.all([
    supabaseAdmin
      .from("campaigns")
      .select("id, campaign_id, brand_name, campaign_name, status, start_date, end_date, created_at, publisher")
      .eq("survey_id", id)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("vw_campaign_stats")
      .select("campaign_id, response_count"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const statsMap = new Map(
    (stats ?? []).map((s: Record<string, unknown>) => [
      s.campaign_id as string,
      s.response_count as number,
    ])
  );

  const data = (campaigns ?? []).map((c: Record<string, unknown>) => ({
    ...c,
    response_count: statsMap.get(c.campaign_id as string) ?? 0,
  }));

  return NextResponse.json({ data });
}
