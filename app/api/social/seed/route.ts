// Creates the three Phase 7 Wave 1 validation test searches.
// Safe to run multiple times — skips searches with the same name.
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const TEST_SEARCHES = [
  {
    name:          "Liverpool FC Global",
    entity_type:   "Club",
    research_goal: "Market Comparison",
    description:   "Global sentiment and market comparison across UK, Germany, India and USA fan bases.",
    markets:       ["GB", "DE", "IN", "US"],
    platforms:     ["Reddit", "YouTube", "News"],
    frequency:     "Manual",
    status:        "Active",
    keywords: [
      { keyword: "Liverpool",    keyword_type: "Club" },
      { keyword: "Liverpool FC", keyword_type: "Club" },
      { keyword: "LFC",          keyword_type: "Club" },
      { keyword: "YNWA",         keyword_type: "Hashtag" },
      { keyword: "Anfield",      keyword_type: "Topic" },
    ],
    gen_count: 500,
    gen_distribution: { Reddit: 60, YouTube: 30, News: 10 },
  },
  {
    name:          "Carlsberg UEFA",
    entity_type:   "Brand",
    research_goal: "Sponsorship Perception",
    description:   "Sponsorship perception and brand sentiment across key European and Asian markets.",
    markets:       ["GB", "DE", "IN", "SE"],
    platforms:     ["Reddit", "News", "YouTube"],
    frequency:     "Manual",
    status:        "Active",
    keywords: [
      { keyword: "Carlsberg",          keyword_type: "Brand" },
      { keyword: "Carlsberg Football", keyword_type: "Brand" },
      { keyword: "Carlsberg UEFA",     keyword_type: "Brand" },
      { keyword: "#Carlsberg",         keyword_type: "Hashtag" },
    ],
    gen_count: 300,
    gen_distribution: { Reddit: 40, News: 40, YouTube: 20 },
  },
  {
    name:          "Women's Football Growth",
    entity_type:   "Topic",
    research_goal: "Emerging Topics",
    description:   "Tracking emerging topics and sentiment around women's football growth across UK, Germany and USA.",
    markets:       ["GB", "DE", "US"],
    platforms:     ["Reddit", "News", "YouTube"],
    frequency:     "Manual",
    status:        "Active",
    keywords: [
      { keyword: "Women's Football",    keyword_type: "Topic" },
      { keyword: "Women's Euros",       keyword_type: "Competition" },
      { keyword: "Women's World Cup",   keyword_type: "Competition" },
      { keyword: "WEURO",               keyword_type: "Hashtag" },
      { keyword: "WWC",                 keyword_type: "Hashtag" },
    ],
    gen_count: 300,
    gen_distribution: { Reddit: 33, News: 40, YouTube: 27 },
  },
];

export async function POST(req: NextRequest) {
  let session;
  try { session = await requireSession(req, ["admin"]); } catch (err) { return err as Response; }

  const created: string[] = [];
  const skipped: string[] = [];

  for (const s of TEST_SEARCHES) {
    // Check if already exists
    const { data: existing } = await supabaseAdmin
      .from("social_searches")
      .select("id, name")
      .eq("name", s.name)
      .single();

    if (existing) { skipped.push(s.name); continue; }

    // Create search
    const { data: search, error: sErr } = await supabaseAdmin
      .from("social_searches")
      .insert({
        name: s.name, entity_type: s.entity_type, research_goal: s.research_goal,
        description: s.description, markets: s.markets, platforms: s.platforms,
        frequency: s.frequency, status: s.status, created_by: session.username,
      })
      .select()
      .single();

    if (sErr || !search) { console.error("[seed] search insert error:", sErr); continue; }

    // Insert keywords
    await supabaseAdmin.from("social_keywords").insert(
      s.keywords.map(k => ({ search_id: search.id, keyword: k.keyword, keyword_type: k.keyword_type }))
    );

    created.push(s.name);
  }

  return NextResponse.json({
    created, skipped,
    message: created.length
      ? `Created: ${created.join(", ")}. Now use "✦ Generate Sample" on each search to populate mentions.`
      : "All searches already exist.",
    next_step: "Go to Social Listening → Searches and click '✦ Generate Sample' on each search card.",
  });
}
