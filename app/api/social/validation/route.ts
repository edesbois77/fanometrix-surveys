// Returns distribution stats and sample mentions for the Validation page.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

function dist<T extends string>(items: T[]): { label: T; count: number; pct: number }[] {
  const m: Record<string, number> = {};
  for (const v of items) m[v as string] = (m[v as string] ?? 0) + 1;
  const total = items.length || 1;
  return Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label: label as T, count, pct: Math.round((count / total) * 100) }));
}

export async function GET(req: NextRequest) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const searchId = req.nextUrl.searchParams.get("search_id");
  const limit    = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "200"), 500);

  let q = supabaseAdmin
    .from("social_mentions")
    .select("id, platform, market, author, content, sentiment, topic, subtopic, ai_summary, import_source, published_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (searchId) q = q.eq("search_id", searchId);

  const { data: mentions, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const all = mentions ?? [];
  const total = all.length;

  return NextResponse.json({
    total,
    synthetic_count: all.filter(m => m.import_source === "synthetic").length,
    distributions: {
      sentiment: dist(all.map(m => m.sentiment ?? "Unknown")),
      topic:     dist(all.filter(m => m.topic).map(m => m.topic!)),
      subtopic:  dist(all.filter(m => m.subtopic).map(m => m.subtopic!)),
      platform:  dist(all.map(m => m.platform ?? "Unknown")),
      market:    dist(all.filter(m => m.market).map(m => m.market!)),
    },
    mentions: all, // returned for the review table
  });
}
