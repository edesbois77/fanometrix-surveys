import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// ─── Weighted random helper ───────────────────────────────────────────────────

function pick<T>(weighted: [T, number][]): T {
  let r = Math.random() * weighted.reduce((s, [, w]) => s + w, 0);
  for (const [item, w] of weighted) { r -= w; if (r <= 0) return item; }
  return weighted[weighted.length - 1][0];
}

// ─── Distributions ────────────────────────────────────────────────────────────

const COUNTRIES: [string, number][] = [
  ["United Kingdom", 40], ["Germany", 20], ["Spain", 15],
  ["Italy", 10], ["France", 10],
  ["Netherlands", 1], ["Belgium", 1], ["Portugal", 1], ["Ireland", 1], ["Brazil", 1],
];

const PUBLISHERS: [string, number][] = [
  ["FotMob", 35], ["LiveScore", 35], ["Forza Football", 20], ["Football365", 10],
];

const PLACEMENTS: [string, number][] = [
  ["homepage-mpu", 40], ["match-centre-mpu", 30], ["article-inline", 15],
  ["team-page-mpu", 10], ["league-page-mpu", 5],
];

const CLUBS: [string, number][] = [
  ["Arsenal", 10], ["Liverpool", 10], ["Chelsea", 7], ["Manchester City", 8],
  ["Manchester United", 7], ["Tottenham", 6], ["Newcastle", 4],
  ["Barcelona", 8], ["Real Madrid", 8], ["Atletico Madrid", 3],
  ["Bayern Munich", 6], ["Dortmund", 4],
  ["Juventus", 5], ["AC Milan", 4], ["Inter Milan", 4],
  ["PSG", 5], ["Aston Villa", 2], ["West Ham", 2],
];

const COMPETITIONS: [string, number][] = [
  ["Premier League", 35], ["UEFA Champions League", 25],
  ["La Liga", 15], ["Bundesliga", 10], ["Serie A", 10],
  ["UEFA Europa League", 5],
];

const FAN_SEGMENTS: [string, number][] = [
  ["season-ticket-holder", 30], ["casual-viewer", 30], ["digital-fan", 20],
  ["vip-member", 10], ["matchday-fan", 10],
];

const DEVICES: [string, number][] = [
  ["mobile", 75], ["desktop", 20], ["tablet", 5],
];

const BROWSERS: Record<string, [string, number][]> = {
  mobile:  [["Safari", 55], ["Chrome", 40], ["Firefox", 5]],
  desktop: [["Chrome", 60], ["Edge", 20], ["Firefox", 15], ["Safari", 5]],
  tablet:  [["Safari", 50], ["Chrome", 45], ["Firefox", 5]],
};

const Q1: [string, number][] = [
  ["Never", 25], ["1-2 times a year", 35],
  ["3-5 times a year", 25], ["5+ times a year", 15],
];

const Q2: [string, number][] = [
  ["Poor", 5], ["Average", 20], ["Good", 45], ["Excellent", 30],
];

const Q3: [string, number][] = [
  ["Not likely", 5], ["Somewhat likely", 20], ["Likely", 40], ["Very likely", 35],
];

// ─── Date helper — skewed toward recent (last 90 days) ───────────────────────

function randomDate(): string {
  // Power distribution: more responses in recent days
  const daysAgo = Math.floor(Math.pow(Math.random(), 1.8) * 90);
  const msAgo   = daysAgo * 86_400_000 + Math.random() * 86_400_000;
  return new Date(Date.now() - msAgo).toISOString();
}

// ─── Single response builder ──────────────────────────────────────────────────

function buildResponse(campaignSlug: string) {
  const device = pick(DEVICES);
  return {
    campaign_id:               campaignSlug,
    publisher:                 pick(PUBLISHERS),
    placement:                 pick(PLACEMENTS),
    club:                      pick(CLUBS),
    competition:               pick(COMPETITIONS),
    country:                   pick(COUNTRIES),
    fan_segment:               pick(FAN_SEGMENTS),
    device,
    browser:                   pick(BROWSERS[device] ?? BROWSERS.mobile),
    q1:                        pick(Q1),
    q2:                        pick(Q2),
    q3:                        pick(Q3),
    response_duration_seconds: Math.floor(Math.random() * 90) + 15,
    created_at:                randomDate(),
    is_demo:                   true,
  };
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { count = 100 } = await req.json();
  const safeCount = Math.min(Math.max(1, count), 500); // max 500 per call

  // Use existing campaign slugs if available, else fall back to demo defaults
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("campaign_id")
    .eq("status", "live")
    .limit(10);

  const slugs: string[] = campaigns?.length
    ? campaigns.map(c => c.campaign_id)
    : ["demo-pl-2026", "demo-ucl-2026", "demo-champions-2026"];

  const rows = Array.from({ length: safeCount }, () =>
    buildResponse(slugs[Math.floor(Math.random() * slugs.length)])
  );

  const { error } = await supabase.from("responses").insert(rows);

  if (error) {
    console.error("Demo generate error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ inserted: safeCount });
}
