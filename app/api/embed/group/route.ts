// Public endpoint — no auth required.
// Resolves a campaign group slug to one eligible campaign and returns its
// survey questions resolved to the appropriate language.
//
// Market filtering order (all conditions must pass):
//   1. Group is live and within date range
//   2. Campaign is live and within date range and not deleted
//   3. Campaign country_code matches ?country= param (if provided)
//   4. Campaign market matches ?market= param (if provided, case-insensitive)
//   5. Campaign publisher matches ?publisher= param (if provided; null publisher = wildcard)
//   6. Campaign has not reached target responses
//   7. Survey is valid and not deleted
//
// Language priority:
//   1. Explicit ?lang= URL param
//   2. Campaign survey_language
//   3. English fallback

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validateSurvey } from "@/lib/survey-validation";
import { resolveQuestion, type LangCode, type LocalisedQuestion } from "@/lib/survey-locale";

export async function GET(req: NextRequest) {
  const slug      = req.nextUrl.searchParams.get("slug");
  const country   = req.nextUrl.searchParams.get("country")?.trim().toUpperCase() ?? null;  // ISO code, e.g. "GB"
  const market    = req.nextUrl.searchParams.get("market")?.trim() ?? null;                 // e.g. "United Kingdom"
  const publisher = req.nextUrl.searchParams.get("publisher")?.trim() ?? null;
  const urlLang   = req.nextUrl.searchParams.get("lang")?.trim() ?? null;                   // explicit override

  if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });

  const now = new Date();

  // 1. Find group
  const { data: group, error: groupErr } = await supabase
    .from("campaign_groups")
    .select("id, status, rotation, start_date, end_date")
    .eq("group_id", slug)
    .single();

  if (groupErr || !group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  // 2. Group eligibility
  if (group.status !== "live") {
    return NextResponse.json({ error: "Group not live" }, { status: 404 });
  }
  if (group.start_date && new Date(`${group.start_date}T00:00:00`) > now) {
    return NextResponse.json({ error: "Group not yet started" }, { status: 404 });
  }
  if (group.end_date && new Date(`${group.end_date}T23:59:59`) < now) {
    return NextResponse.json({ error: "Group has ended" }, { status: 404 });
  }

  // 3. Fetch members + campaigns + stats in parallel
  const [{ data: members }, { data: statsData }] = await Promise.all([
    supabase
      .from("campaign_group_members")
      .select("campaign_id, weight, priority")
      .eq("group_id", group.id),
    supabase.from("vw_campaign_stats").select("campaign_id, response_count"),
  ]);

  if (!members?.length) {
    return NextResponse.json({ error: "No campaigns in group" }, { status: 404 });
  }

  const campaignUuids = members.map(m => m.campaign_id);

  type CampaignRow = {
    id: string;
    campaign_id: string;
    status: string;
    start_date: string | null;
    end_date: string | null;
    target_responses: number | null;
    deleted_at: string | null;
    publisher: string | null;
    country_code: string | null;
    market: string | null;
    survey_language: string | null;
    surveys: { questions: unknown[]; thank_you_title: string; thank_you_body: string } | null;
  };

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, campaign_id, status, start_date, end_date, target_responses, deleted_at, publisher, country_code, market, survey_language, creative_theme, surveys(questions, thank_you_title, thank_you_body)")
    .in("id", campaignUuids) as { data: CampaignRow[] | null };

  if (!campaigns?.length) {
    return NextResponse.json({ error: "No campaigns found" }, { status: 404 });
  }

  const responsesBySlug: Record<string, number> = {};
  for (const s of statsData ?? []) responsesBySlug[s.campaign_id] = Number(s.response_count ?? 0);

  // 4. Filter to eligible campaigns — apply all conditions in order
  const eligible = members.filter(m => {
    const c = campaigns.find(x => x.id === m.campaign_id);
    if (!c) return false;

    // Campaign must be live, in date range, not deleted
    if (c.deleted_at) return false;
    if (c.status !== "live") return false;
    if (c.start_date && new Date(`${c.start_date}T00:00:00`) > now) return false;
    if (c.end_date   && new Date(`${c.end_date}T23:59:59`)   < now) return false;

    // Country filter — case-insensitive ISO code match
    if (country && c.country_code) {
      if (c.country_code.toUpperCase() !== country) return false;
    } else if (country && !c.country_code) {
      // Campaign has no country_code set — treat as wildcard (include it)
      // Remove this `else if` body to make country matching strict instead
    }

    // Market filter — case-insensitive match
    if (market && c.market) {
      if (c.market.trim().toLowerCase() !== market.toLowerCase()) return false;
    }

    // Publisher filter — null publisher on campaign means it accepts any publisher
    if (publisher && c.publisher) {
      if (c.publisher.toLowerCase() !== publisher.toLowerCase()) return false;
    }

    // Must not have reached target responses
    const rc = responsesBySlug[c.campaign_id] ?? 0;
    if (c.target_responses !== null && rc >= c.target_responses) return false;

    // Survey must exist and pass MPU validation
    const survey = c.surveys as { questions?: unknown[]; thank_you_title?: string; thank_you_body?: string } | null;
    if (!survey || !(survey.questions as unknown[])?.length) return false;
    if (validateSurvey(survey as Parameters<typeof validateSurvey>[0]).length > 0) return false;

    return true;
  });

  if (!eligible.length) {
    // Diagnostic log — visible in Vercel function logs
    const reason = country
      ? `No eligible campaign for country=${country}${market ? ` market=${market}` : ""}`
      : "No eligible campaigns";
    console.info(`[embed/group] ${slug}: ${reason}`);
    return NextResponse.json({ error: reason }, { status: 404 });
  }

  // 5. Pick one campaign using the group's rotation strategy
  let chosen: (typeof eligible)[0];

  if (group.rotation === "priority") {
    chosen = eligible.reduce((best, m) => m.priority < best.priority ? m : best);
  } else if (group.rotation === "weighted") {
    const total = eligible.reduce((s, m) => s + m.weight, 0);
    let rnd = Math.random() * total;
    chosen = eligible[eligible.length - 1];
    for (const m of eligible) { rnd -= m.weight; if (rnd <= 0) { chosen = m; break; } }
  } else {
    chosen = eligible[Math.floor(Math.random() * eligible.length)];
  }

  const campaign = campaigns.find(c => c.id === chosen.campaign_id)!;
  const survey   = campaign.surveys as unknown as {
    questions: LocalisedQuestion[];
    thank_you_title: string;
    thank_you_body: string;
  } | null;

  // Language priority: explicit URL param > campaign survey_language > en
  const lang = (urlLang ?? campaign.survey_language ?? "en") as LangCode;

  const questions = (survey?.questions ?? []).map(q => resolveQuestion(q, lang));

  return NextResponse.json({
    campaign_id:     campaign.campaign_id,
    group_id:        slug,
    survey_language: lang,
    country_code:    campaign.country_code ?? null,
    market:          campaign.market ?? null,
    creative_theme:  (campaign as Record<string, unknown>).creative_theme ?? null,
    questions,
    thank_you_title: survey?.thank_you_title ?? "Thank you!",
    thank_you_body:  survey?.thank_you_body  ?? "Your anonymous feedback helps improve the football experience for fans everywhere.",
  });
}
