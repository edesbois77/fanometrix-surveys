// Reading the raw material for a partner report.
//
// Event counts come from the hourly rollup for sealed history and from raw
// survey_events for the unsealed tail, unioned on the watermark exactly as
// dashboard_event_counts does (see supabase-migration-136.sql). Reading only
// the rollup would silently drop the most recent hours — on a report stamped
// "data through <now>" that is not a rounding error, it is a wrong number.
//
// Nothing here interprets anything. Interpretation is engine.ts.

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { BuilderState } from "@/lib/creative-theme-builder";

export type EventBucket = {
  /** ISO hour bucket, UTC. */
  hour: string;
  campaignId: string;
  eventType: string;
  country: string;
  device: string;
  count: number;
};

export type ResponseRow = {
  id: string;
  campaign_id: string;
  q1: string | null;
  q2: string | null;
  q3: string | null;
  country: string | null;
  country_code: string | null;
  created_at: string;
  publisher: string | null;
  placement: string | null;
  device: string | null;
  browser: string | null;
  survey_language: string | null;
  response_duration_seconds: number | null;
};

export type CampaignRow = {
  id: string;
  campaign_id: string;
  campaign_name: string;
  campaign_number: number | null;
  country_code: string | null;
  market: string | null;
  creative_design: string | null;
  survey_id: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
};

export type CreativeDesignRow = {
  slug: string;
  name: string;
  layout: string | null;
  /** The design's colour inputs. Carried through so the report can render the
   *  real creative on the server-supplied data rather than fetching an
   *  authenticated admin API from a page whose reader has no account. */
  builder_state: BuilderState | null;
};

export type SurveyQuestion = {
  id: string;
  text: string | Record<string, string>;
  options: { id: number; text: string | Record<string, string> }[];
};

const PAGE = 1000;

/** PostgREST caps a response at 1,000 rows; every read here pages to the end
 *  rather than silently truncating. */
async function pageAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

export async function fetchCampaigns(campaignIds: string[]): Promise<CampaignRow[]> {
  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .select(
      "id, campaign_id, campaign_name, campaign_number, country_code, market, creative_design, survey_id, status, start_date, end_date",
    )
    .in("campaign_id", campaignIds)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  return (data ?? []) as CampaignRow[];
}

export async function fetchCreativeDesigns(): Promise<CreativeDesignRow[]> {
  const { data, error } = await supabaseAdmin
    .from("creative_designs")
    .select("slug, name, layout, builder_state");
  if (error) return [];
  return (data ?? []) as CreativeDesignRow[];
}

export async function fetchSurveyQuestions(surveyIds: string[]): Promise<Map<string, SurveyQuestion[]>> {
  const ids = surveyIds.filter(Boolean);
  if (ids.length === 0) return new Map();
  const { data, error } = await supabaseAdmin.from("surveys").select("id, questions").in("id", ids);
  if (error) return new Map();
  return new Map(
    ((data ?? []) as { id: string; questions: SurveyQuestion[] }[]).map((r) => [r.id, r.questions ?? []]),
  );
}

/** How far the rollups are trusted. Everything at or after this instant must be
 *  counted from raw events. */
async function sealedThrough(): Promise<string> {
  const { data } = await supabaseAdmin
    .from("rollup_watermark")
    .select("sealed_through")
    .eq("rollup_name", "event_agg")
    .maybeSingle();
  return (data as { sealed_through: string } | null)?.sealed_through ?? "1970-01-01T00:00:00Z";
}

/** Every event in scope as hourly buckets: rollup rows below the watermark,
 *  raw rows at or above it, in one list with one meaning. */
export async function fetchEventBuckets(
  campaignIds: string[],
  dataFrom: string | null,
): Promise<{ buckets: EventBucket[]; sealedThrough: string; lastRawEvent: string | null }> {
  const seal = await sealedThrough();

  const rollup = await pageAll<{
    bucket_hour: string;
    campaign_id: string;
    event_type: string;
    country: string;
    device: string;
    event_count: number;
  }>((from, to) => {
    let q = supabaseAdmin
      .from("event_agg_hourly")
      .select("bucket_hour, campaign_id, event_type, country, device, event_count")
      .in("campaign_id", campaignIds)
      .lt("bucket_hour", seal)
      .order("bucket_hour")
      .range(from, to);
    if (dataFrom) q = q.gte("bucket_hour", dataFrom);
    return q;
  });

  const raw = await pageAll<{
    created_at: string;
    campaign_id: string;
    event_type: string;
    country: string | null;
    device: string | null;
  }>((from, to) => {
    let q = supabaseAdmin
      .from("survey_events")
      .select("created_at, campaign_id, event_type, country, device")
      .in("campaign_id", campaignIds)
      .gte("created_at", seal)
      .order("created_at")
      .range(from, to);
    if (dataFrom) q = q.gte("created_at", dataFrom);
    return q;
  });

  const buckets: EventBucket[] = rollup.map((r) => ({
    hour: new Date(r.bucket_hour).toISOString().slice(0, 13) + ":00:00.000Z",
    campaignId: r.campaign_id,
    eventType: r.event_type,
    country: r.country ?? "",
    device: r.device ?? "",
    count: Number(r.event_count) || 0,
  }));

  for (const e of raw) {
    buckets.push({
      hour: new Date(e.created_at).toISOString().slice(0, 13) + ":00:00.000Z",
      campaignId: e.campaign_id,
      eventType: e.event_type,
      country: e.country ?? "",
      device: e.device ?? "",
      count: 1,
    });
  }

  const lastRawEvent = raw.length > 0 ? raw[raw.length - 1].created_at : null;
  return { buckets, sealedThrough: seal, lastRawEvent };
}

/** The earliest event in scope. Needed for the reported date range, which must
 *  come from observed delivery rather than the campaign's planned start_date —
 *  the two are not always the same. */
export async function fetchFirstEventAt(
  campaignIds: string[],
  dataFrom: string | null,
): Promise<string | null> {
  let q = supabaseAdmin
    .from("survey_events")
    .select("created_at")
    .in("campaign_id", campaignIds)
    .order("created_at", { ascending: true })
    .limit(1);
  if (dataFrom) q = q.gte("created_at", dataFrom);
  const { data } = await q;
  return (data as { created_at: string }[] | null)?.[0]?.created_at ?? null;
}

export async function fetchLastEventAt(
  campaignIds: string[],
  dataFrom: string | null,
): Promise<string | null> {
  let q = supabaseAdmin
    .from("survey_events")
    .select("created_at")
    .in("campaign_id", campaignIds)
    .order("created_at", { ascending: false })
    .limit(1);
  if (dataFrom) q = q.gte("created_at", dataFrom);
  const { data } = await q;
  return (data as { created_at: string }[] | null)?.[0]?.created_at ?? null;
}

export async function fetchResponses(
  campaignIds: string[],
  dataFrom: string | null,
): Promise<ResponseRow[]> {
  return pageAll<ResponseRow>((from, to) => {
    let q = supabaseAdmin
      .from("responses")
      .select(
        "id, campaign_id, q1, q2, q3, country, country_code, created_at, publisher, placement, device, browser, survey_language, response_duration_seconds",
      )
      .in("campaign_id", campaignIds)
      .order("created_at")
      .range(from, to);
    if (dataFrom) q = q.gte("created_at", dataFrom);
    return q;
  });
}

/** The first hour SURVEY_VISIBLE was ever recorded for these campaigns.
 *
 *  Viewability was instrumented mid-flight, so a lifetime viewability figure
 *  understates every campaign that ran before that release — badly enough to
 *  look like a delivery failure when it is an instrumentation boundary. The
 *  report quotes viewability only from this instant onward, and says so. */
export function firstViewableHour(buckets: EventBucket[]): string | null {
  let earliest: string | null = null;
  for (const b of buckets) {
    if (b.eventType !== "SURVEY_VISIBLE") continue;
    if (earliest === null || b.hour < earliest) earliest = b.hour;
  }
  return earliest;
}
