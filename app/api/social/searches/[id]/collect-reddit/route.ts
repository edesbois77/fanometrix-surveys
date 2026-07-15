// Triggers a real Reddit data collection run for one social_search:
// searches its configured subreddits for its keywords, dedupes against
// mentions already stored, classifies the new ones, and inserts them.
// Admin-triggered only — no cron/background job runs this automatically.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchRedditMentions } from "@/lib/reddit-collector";
import { classifyContent } from "@/lib/ai-classify";

const BATCH = 5; // classify in small batches to avoid rate limits

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;

  const { data: search, error: sErr } = await supabaseAdmin
    .from("social_searches")
    .select("id, name, reddit_subreddits, social_keywords(keyword), is_simulated")
    .eq("id", id)
    .single();

  if (sErr || !search) return NextResponse.json({ error: "Search not found" }, { status: 404 });

  // Real collection only. A simulated search only ever receives
  // evidence from the Simulation engine's own generation routes.
  if (search.is_simulated) {
    return NextResponse.json({ error: "This search belongs to a simulated research project and cannot collect real mentions." }, { status: 403 });
  }

  const subreddits = (search.reddit_subreddits as string[]) ?? [];
  const keywords    = (search.social_keywords as { keyword: string }[]).map(k => k.keyword);

  if (!subreddits.length) {
    return NextResponse.json({ error: "Add at least one target subreddit before collecting." }, { status: 400 });
  }
  if (!keywords.length) {
    return NextResponse.json({ error: "This search has no keywords to match against." }, { status: 400 });
  }

  await supabaseAdmin.from("social_searches")
    .update({ reddit_collection_status: "collecting", reddit_collection_error: null })
    .eq("id", id);

  try {
    const items = await fetchRedditMentions(subreddits, keywords);

    const externalIds = items.map(i => i.external_id);
    const { data: existing } = await supabaseAdmin
      .from("social_mentions")
      .select("external_id")
      .eq("platform", "Reddit")
      .in("external_id", externalIds.length ? externalIds : ["__none__"]);
    const existingIds = new Set((existing ?? []).map(r => r.external_id));
    const newItems = items.filter(i => !existingIds.has(i.external_id));

    let saved = 0;
    for (let i = 0; i < newItems.length; i += BATCH) {
      const batch      = newItems.slice(i, i + BATCH);
      const classified = await Promise.all(batch.map(item => classifyContent(item.content)));

      const inserts = batch.map((item, j) => ({
        search_id:     id,
        platform:      "Reddit",
        subreddit:     item.subreddit,
        author:        item.author,
        source_url:    item.source_url,
        content:       item.content,
        published_at:  item.published_at,
        external_id:   item.external_id,
        sentiment:     classified[j].sentiment,
        topic:         classified[j].topic,
        subtopic:      classified[j].subtopic,
        ai_summary:    classified[j].ai_summary,
        import_source: "reddit_api",
      }));

      const { error: insertErr } = await supabaseAdmin.from("social_mentions").insert(inserts);
      if (!insertErr) saved += batch.length;
      else console.error("[collect-reddit] insert error:", insertErr.message);
    }

    const { count } = await supabaseAdmin
      .from("social_mentions")
      .select("id", { count: "exact", head: true })
      .eq("search_id", id)
      .eq("platform", "Reddit");

    await supabaseAdmin.from("social_searches").update({
      reddit_collection_status:   "completed",
      reddit_last_collected_at:   new Date().toISOString(),
      reddit_mentions_collected:  count ?? 0,
      reddit_collection_error:    null,
    }).eq("id", id);

    console.info(`[collect-reddit] ${session.workEmail}: fetched ${items.length}, saved ${saved} new for "${search.name}"`);

    return NextResponse.json({ fetched: items.length, saved, skipped: items.length - newItems.length, total: count ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reddit collection failed";
    await supabaseAdmin.from("social_searches").update({
      reddit_collection_status: "failed",
      reddit_collection_error:  message,
    }).eq("id", id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
