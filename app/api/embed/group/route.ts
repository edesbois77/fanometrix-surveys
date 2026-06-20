// Public endpoint — no auth required.
// Resolves a campaign group slug to one eligible campaign and returns its
// survey questions.  Responses must be submitted with the returned campaign_id
// so reporting stays linked to the specific campaign, not the group.
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });

  const now = new Date();

  // 1. Find group
  const { data: group, error: groupErr } = await supabase
    .from("campaign_groups")
    .select("id, status, rotation, start_date, end_date")
    .eq("group_id", slug)
    .single();

  if (groupErr || !group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  // 2. Group eligibility checks
  if (group.status !== "live") return NextResponse.json({ error: "Group not live" }, { status: 404 });
  if (group.start_date && new Date(`${group.start_date}T00:00:00`) > now) {
    return NextResponse.json({ error: "Group not yet started" }, { status: 404 });
  }
  if (group.end_date && new Date(`${group.end_date}T23:59:59`) < now) {
    return NextResponse.json({ error: "Group has ended" }, { status: 404 });
  }

  // 3. Fetch members and their campaigns + surveys in parallel with stats
  const [{ data: members }, { data: statsData }] = await Promise.all([
    supabase
      .from("campaign_group_members")
      .select("campaign_id, weight, priority")
      .eq("group_id", group.id),
    supabase.from("vw_campaign_stats").select("campaign_id, response_count"),
  ]);

  if (!members?.length) return NextResponse.json({ error: "No campaigns in group" }, { status: 404 });

  const campaignUuids = members.map(m => m.campaign_id);

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, campaign_id, status, start_date, end_date, target_responses, deleted_at, surveys(questions, thank_you_title, thank_you_body)")
    .in("id", campaignUuids);

  if (!campaigns?.length) return NextResponse.json({ error: "No campaigns found" }, { status: 404 });

  // Build response count map (by text slug)
  const responsesBySlug: Record<string, number> = {};
  for (const s of statsData ?? []) responsesBySlug[s.campaign_id] = Number(s.response_count ?? 0);

  // 4. Filter to eligible campaigns
  const eligible = members.filter(m => {
    const c = campaigns.find(x => x.id === m.campaign_id);
    if (!c) return false;
    if (c.deleted_at) return false;
    if (c.status !== "live") return false;                                         // must be live
    if (c.start_date && new Date(`${c.start_date}T00:00:00`) > now) return false;  // not started
    if (c.end_date   && new Date(`${c.end_date}T23:59:59`)   < now) return false;  // past end
    const rc = responsesBySlug[c.campaign_id] ?? 0;
    if (c.target_responses !== null && rc >= c.target_responses) return false;     // target hit
    const survey = (c.surveys as { questions?: unknown[]; thank_you_title?: string; thank_you_body?: string } | null);
    if (!survey || !(survey.questions as unknown[])?.length) return false;         // no survey
    return true;
  });

  if (!eligible.length) return NextResponse.json({ error: "No eligible campaigns" }, { status: 404 });

  // 5. Pick one campaign using the group's rotation strategy
  let chosen: (typeof eligible)[0];

  if (group.rotation === "priority") {
    // Lowest priority number wins
    chosen = eligible.reduce((best, m) => m.priority < best.priority ? m : best);
  } else if (group.rotation === "weighted") {
    // Weighted random
    const total = eligible.reduce((s, m) => s + m.weight, 0);
    let rnd = Math.random() * total;
    chosen = eligible[eligible.length - 1];
    for (const m of eligible) {
      rnd -= m.weight;
      if (rnd <= 0) { chosen = m; break; }
    }
  } else {
    // Equal rotation (default) — uniform random
    chosen = eligible[Math.floor(Math.random() * eligible.length)];
  }

  const campaign = campaigns.find(c => c.id === chosen.campaign_id)!;
  const survey = campaign.surveys as unknown as { questions: unknown[]; thank_you_title: string; thank_you_body: string } | null;

  return NextResponse.json({
    campaign_id:     campaign.campaign_id,  // text slug — used for response submission
    questions:       survey?.questions ?? [],
    thank_you_title: survey?.thank_you_title ?? "Thank you!",
    thank_you_body:  survey?.thank_you_body  ?? "Your anonymous feedback helps improve the football experience for fans everywhere.",
  });
}
