import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { visibleResourceIds } from "@/lib/access";
import { getTimingStats, type TimingFilter } from "@/lib/survey-timing";

const EMPTY = {
  renders: 0, starts: 0, q2_reached: 0, q3_reached: 0, completed: 0,
  avg_completion_seconds: null, avg_ttfi_seconds: null,
  completion_sample: 0, ttfi_sample: 0,
};

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireUser(req);
  } catch (err) {
    return err as Response;
  }

  const p            = req.nextUrl.searchParams;
  const campaign_id  = p.get("campaign_id")  || null;
  // campaign_ids: comma-separated list used when scoping by survey (multiple campaigns)
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

  // survey_events is a raw analytics log keyed by the human-readable
  // campaign_id (text), not the campaigns.id uuid, so resolve this user's
  // visible campaigns (via lib/access.ts, which already unifies
  // publisher/brand/agency org-wide and Selected Access into one check)
  // down to that text id before filtering. Empty means "none" — this
  // replaces the old per-role allowed_campaign_ids/allowed_publisher_ids
  // branching, which is now handled uniformly by visibleResourceIds().
  let scopedCampaignIds: string[] | null = null;
  if (user.role !== "admin") {
    const uuids = (await visibleResourceIds(user, "campaign")) ?? [];
    if (uuids.length === 0) return NextResponse.json(EMPTY);

    const { data: rows } = await supabaseAdmin.from("campaigns").select("campaign_id").in("id", uuids);
    scopedCampaignIds = (rows ?? []).map(r => r.campaign_id as string);
    if (scopedCampaignIds.length === 0) return NextResponse.json(EMPTY);
  }

  // Build a count query for a given event type
  function countQuery(eventType: string) {
    let q = supabaseAdmin
      .from("survey_events")
      .select("*", { count: "exact", head: true })
      .eq("event_type", eventType);

    if (campaign_id)        q = q.eq("campaign_id", campaign_id);
    else if (campaign_ids)  q = q.in("campaign_id", campaign_ids);
    if (publisher)   q = q.eq("publisher",   publisher);
    if (placement)   q = q.eq("placement",   placement);
    if (country)     q = q.eq("country",     country);
    if (device)      q = q.eq("device",      device);
    if (browser)     q = q.eq("browser",     browser);
    // date_from / date_to are full ISO instants (see getDateBounds); calendar
    // presets already carry end-of-day, rolling presets carry the exact instant.
    if (date_from)   q = q.gte("created_at", date_from);
    if (date_to)     q = q.lte("created_at", date_to);

    if (scopedCampaignIds) q = q.in("campaign_id", scopedCampaignIds);

    return q;
  }

  // Timing metrics (events-based; see lib/survey-timing.ts + docs/metrics-timing.md)
  // reuse the exact same dimension/scope/date filters as the funnel counts.
  const timingFilter: TimingFilter = {
    campaign_id, campaign_ids, publisher, placement, country, device, browser,
    date_from, date_to, scopedCampaignIds,
  };

  const [results, timing] = await Promise.all([
    Promise.all(
      ["SURVEY_RENDER", "SURVEY_START", "QUESTION_2_REACHED", "QUESTION_3_REACHED", "SURVEY_COMPLETED"].map(countQuery)
    ),
    getTimingStats(supabaseAdmin, timingFilter),
  ]);

  return NextResponse.json({
    renders:    results[0].count ?? 0,
    starts:     results[1].count ?? 0,
    q2_reached: results[2].count ?? 0,
    q3_reached: results[3].count ?? 0,
    completed:  results[4].count ?? 0,
    avg_completion_seconds: timing.avg_completion_seconds,
    avg_ttfi_seconds:       timing.avg_ttfi_seconds,
    completion_sample:      timing.completion_sample,
    ttfi_sample:            timing.ttfi_sample,
  });
}
