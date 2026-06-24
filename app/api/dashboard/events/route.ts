import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession, type SessionPayload } from "@/lib/auth";

export async function GET(req: NextRequest) {
  let session: SessionPayload;
  try {
    session = await requireSession(req);
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
    if (date_from)   q = q.gte("created_at", date_from);
    if (date_to)     q = q.lte("created_at", `${date_to}T23:59:59`);

    // Role-based campaign filtering (supabaseAdmin bypasses RLS, so apply manually)
    if (session.role === "brand" || session.role === "agency") {
      const ids = session.allowedCampaignIds;
      if (ids.length === 0) return null;
      q = q.in("campaign_id", ids);
    } else if (session.role === "publisher") {
      const ids = session.allowedPublisherIds;
      if (ids.length === 0) return null;
      q = q.in("publisher", ids);
    }

    return q;
  }

  // Short-circuit for roles with no access
  const renders   = countQuery("SURVEY_RENDER");
  const starts    = countQuery("SURVEY_START");
  const q2        = countQuery("QUESTION_2_REACHED");
  const q3        = countQuery("QUESTION_3_REACHED");
  const completed = countQuery("SURVEY_COMPLETED");

  if (!renders || !starts || !q2 || !q3 || !completed) {
    return NextResponse.json({ renders: 0, starts: 0, q2_reached: 0, q3_reached: 0, completed: 0 });
  }

  const results = await Promise.all([renders, starts, q2, q3, completed]);

  return NextResponse.json({
    renders:    results[0].count ?? 0,
    starts:     results[1].count ?? 0,
    q2_reached: results[2].count ?? 0,
    q3_reached: results[3].count ?? 0,
    completed:  results[4].count ?? 0,
  });
}
