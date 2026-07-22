import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { visibleResourceIds } from "@/lib/access";
import { getTimingStats, type TimingFilter } from "@/lib/survey-timing";

// Genuine zeros: the caller can see no campaigns at all, so every funnel stage
// really is empty. Distinct from a null count, which means "could not compute".
const EMPTY = {
  renders: 0, viewable: 0, starts: 0, q2_reached: 0, q3_reached: 0, completed: 0,
  degraded: false,
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

  // A count that could not be computed is NOT zero. survey_events is large and
  // growing, so a count can be cancelled by the statement timeout (57014) while
  // its smaller siblings succeed. Coercing that to 0 used to render a confident
  // "Impressions (Loads) 0" next to a real Q1 Answered figure, and collapsed
  // every impression-denominated rate to "—" via a zero denominator. Returning
  // null lets the client say "not available" instead of stating a false zero.
  async function safeCount(eventType: string): Promise<number | null> {
    const { count, error } = await countQuery(eventType);
    if (error) {
      console.error(`[dashboard/events] ${eventType} count failed:`, error.code, error.message);
      return null;
    }
    return count ?? 0;
  }

  // Timing metrics (events-based; see lib/survey-timing.ts + docs/metrics-timing.md)
  // reuse the exact same dimension/scope/date filters as the funnel counts.
  const timingFilter: TimingFilter = {
    campaign_id, campaign_ids, publisher, placement, country, device, browser,
    date_from, date_to, scopedCampaignIds,
  };

  const [results, timing] = await Promise.all([
    Promise.all(
      ["SURVEY_RENDER", "SURVEY_VISIBLE", "SURVEY_START", "QUESTION_2_REACHED", "QUESTION_3_REACHED", "SURVEY_COMPLETED"].map(safeCount)
    ),
    // Timing paginates raw event rows and throws on a failed page. That must not
    // take the whole funnel down with it — the counts above are useful on their
    // own, so a timing failure degrades to "no sample" (rendered as "—").
    getTimingStats(supabaseAdmin, timingFilter).catch(err => {
      console.error("[dashboard/events] timing stats failed:", err?.code, err?.message);
      return { avg_completion_seconds: null, avg_ttfi_seconds: null, completion_sample: 0, ttfi_sample: 0 };
    }),
  ]);

  return NextResponse.json({
    renders:    results[0],  // SURVEY_RENDER = loads / impressions
    viewable:   results[1],  // SURVEY_VISIBLE = viewable impressions
    starts:     results[2],
    q2_reached: results[3],
    q3_reached: results[4],
    completed:  results[5],
    // True when at least one count could not be computed, so the dashboard can
    // explain the "—"s rather than leaving them ambiguous.
    degraded:   results.some(r => r === null),
    avg_completion_seconds: timing.avg_completion_seconds,
    avg_ttfi_seconds:       timing.avg_ttfi_seconds,
    completion_sample:      timing.completion_sample,
    ttfi_sample:            timing.ttfi_sample,
  });
}
