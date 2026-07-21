import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { visibleResourceIds } from "@/lib/access";

// Render events over time for the "Responses Over Time" chart's Renders metric.
// The sibling /api/dashboard/events endpoint returns only aggregate totals, so
// this one buckets SURVEY_RENDER events by hour and by day server-side. Both
// maps are returned; the client picks the one matching the chart's granularity.
//
// Keys mirror the client's response bucketing exactly (created_at.slice(0,13)
// for the hour, .slice(0,10) for the day) so the render line aligns with the
// response line on the same x-axis.

const EMPTY = { hour: {} as Record<string, number>, day: {} as Record<string, number> };

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireUser(req);
  } catch (err) {
    return err as Response;
  }

  const p            = req.nextUrl.searchParams;
  const campaign_id  = p.get("campaign_id")  || null;
  const campaign_ids = p.get("campaign_ids")
    ? p.get("campaign_ids")!.split(",").filter(Boolean)
    : null;
  const publisher    = p.get("publisher")    || null;
  const placement    = p.get("placement")    || null;
  const country      = p.get("country")      || null;
  const device       = p.get("device")       || null;
  const browser      = p.get("browser")      || null;
  const date_from    = p.get("date_from")    || null;
  const date_to      = p.get("date_to")      || null;

  // Resolve the user's visible campaigns to the text campaign_id survey_events
  // is keyed by — same access model as /api/dashboard/events.
  let scopedCampaignIds: string[] | null = null;
  if (user.role !== "admin") {
    const uuids = (await visibleResourceIds(user, "campaign")) ?? [];
    if (uuids.length === 0) return NextResponse.json(EMPTY);

    const { data: rows } = await supabaseAdmin.from("campaigns").select("campaign_id").in("id", uuids);
    scopedCampaignIds = (rows ?? []).map(r => r.campaign_id as string);
    if (scopedCampaignIds.length === 0) return NextResponse.json(EMPTY);
  }

  // A fresh, fully-filtered query each call — Supabase query builders are
  // single-use, and .range() pagination below needs a new one per page.
  function baseQuery() {
    let q = supabaseAdmin
      .from("survey_events")
      .select("created_at")
      .eq("event_type", "SURVEY_RENDER")
      .order("created_at", { ascending: true });

    if (campaign_id)        q = q.eq("campaign_id", campaign_id);
    else if (campaign_ids)  q = q.in("campaign_id", campaign_ids);
    if (publisher)   q = q.eq("publisher",   publisher);
    if (placement)   q = q.eq("placement",   placement);
    if (country)     q = q.eq("country",     country);
    if (device)      q = q.eq("device",      device);
    if (browser)     q = q.eq("browser",     browser);
    if (date_from)   q = q.gte("created_at", date_from);
    if (date_to)     q = q.lte("created_at", date_to);
    if (scopedCampaignIds) q = q.in("campaign_id", scopedCampaignIds);

    return q;
  }

  // Page through with .range() so the buckets reflect every render, not just the
  // first 1000 (which is Supabase's default select cap). 100 pages = 100k events
  // is well beyond current volume; the loop stops at the last partial page.
  const PAGE = 1000;
  const hour: Record<string, number> = {};
  const day:  Record<string, number> = {};
  for (let page = 0; page < 100; page++) {
    const { data, error } = await baseQuery().range(page * PAGE, page * PAGE + PAGE - 1);
    if (error || !data) break;
    for (const row of data) {
      const ts = row.created_at as string;
      const h = ts.slice(0, 13); // YYYY-MM-DDTHH
      const d = ts.slice(0, 10); // YYYY-MM-DD
      hour[h] = (hour[h] ?? 0) + 1;
      day[d]  = (day[d]  ?? 0) + 1;
    }
    if (data.length < PAGE) break;
  }

  return NextResponse.json({ hour, day });
}
