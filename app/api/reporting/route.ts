import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const API_KEY = process.env.REPORTING_API_KEY;

function auth(req: NextRequest): boolean {
  if (!API_KEY) return true; // open if key not configured
  const header = req.headers.get("authorization");
  const query  = req.nextUrl.searchParams.get("api_key");
  return header === `Bearer ${API_KEY}` || query === API_KEY;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: NextRequest) {
  if (!auth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() });
  }

  const p          = req.nextUrl.searchParams;
  const limit      = Math.min(parseInt(p.get("limit")  ?? "1000"), 10000);
  const offset     = parseInt(p.get("offset") ?? "0");
  const campaignId = p.get("campaign_id");
  const publisher  = p.get("publisher");
  const country    = p.get("country");
  const dateFrom   = p.get("date_from");
  const dateTo     = p.get("date_to");

  let query = supabase
    .from("vw_campaign_responses")
    .select("*", { count: "exact" })
    .order("submitted_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (campaignId) query = query.eq("campaign_slug", campaignId);
  if (publisher)  query = query.eq("publisher",     publisher);
  if (country)    query = query.eq("country",       country);
  if (dateFrom)   query = query.gte("response_date", dateFrom);
  if (dateTo)     query = query.lte("response_date", dateTo);

  const { data, error, count } = await query;

  if (error) {
    console.error("Reporting API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders() });
  }

  return NextResponse.json(
    {
      data,
      meta: {
        total:  count ?? 0,
        limit,
        offset,
        page:   Math.floor(offset / limit) + 1,
        pages:  Math.ceil((count ?? 0) / limit),
        fields: [
          "response_id","campaign_slug","campaign_id","campaign_name","brand",
          "survey_id","survey_slug","survey_name","publisher","placement",
          "club","competition","country","fan_segment","device","browser",
          "q1","q2","q3","response_duration_seconds","is_complete",
          "submitted_at","response_date","response_week","response_month",
          "response_year","response_month_num","response_month_label","response_day_of_week",
          "response_hour","response_daypart",
        ],
      },
    },
    { headers: corsHeaders() },
  );
}
