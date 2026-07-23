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

  // The campaign scope as one list, intersected with what this user may see.
  // null = unscoped; an empty list = a scope matching no campaigns, which is an
  // empty series rather than an unscoped query.
  const requested: string[] | null =
    campaign_id ? [campaign_id] : campaign_ids ? campaign_ids : null;
  const effectiveCampaignIds: string[] | null =
    scopedCampaignIds === null
      ? requested
      : requested === null
        ? scopedCampaignIds
        : requested.filter(id => scopedCampaignIds!.includes(id));

  if (effectiveCampaignIds !== null && effectiveCampaignIds.length === 0) {
    return NextResponse.json(EMPTY);
  }

  // Hour-grain buckets in one round trip: rollup buckets for sealed history, raw
  // only for the unsealed tail.
  //
  // This replaces paging survey_events up to 100 times sequentially with a
  // growing OFFSET and counting in JavaScript. That approach was slow, ran
  // concurrently with the funnel counts on every dashboard load (a large part of
  // why those counts timed out in production but not in isolation), and capped
  // at 100k events, so at 794k renders the chart was simply wrong.
  const { data, error } = await supabaseAdmin.rpc("dashboard_event_series", {
    p_event_type:   "SURVEY_RENDER",
    p_campaign_ids: effectiveCampaignIds,
    p_from:         date_from,
    p_to:           date_to,
    p_publisher:    publisher,
    p_placement:    placement,
    p_country:      country,
    p_device:       device,
    p_browser:      browser,
  });

  if (error) {
    console.error("[dashboard/events/series] rollup series failed:", error.code, error.message);
    return NextResponse.json(EMPTY);
  }

  // Days are folded from the same hour buckets rather than queried separately,
  // so the two granularities can never disagree. Keys match the client's own
  // bucketing of response rows exactly (slice(0,13) / slice(0,10)).
  const hour: Record<string, number> = {};
  const day:  Record<string, number> = {};
  for (const row of (data ?? []) as { bucket_hour: string; event_count: number }[]) {
    const n = Number(row.event_count) || 0;
    const iso = new Date(row.bucket_hour).toISOString();
    hour[iso.slice(0, 13)] = (hour[iso.slice(0, 13)] ?? 0) + n;
    day[iso.slice(0, 10)]  = (day[iso.slice(0, 10)]  ?? 0) + n;
  }

  return NextResponse.json({ hour, day });
}
