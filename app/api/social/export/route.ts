// Export endpoint — returns CSV data or PPTX for the export page to consume.
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  try { await requireSession(req, ["admin"]); } catch (err) { return err as Response; }

  const searchId = req.nextUrl.searchParams.get("search_id");
  const format   = req.nextUrl.searchParams.get("format") ?? "csv";

  if (!searchId) return NextResponse.json({ error: "search_id required" }, { status: 400 });

  const { data: mentions } = await supabaseAdmin
    .from("social_mentions")
    .select("platform, market, author, content, sentiment, topic, subtopic, ai_summary, published_at, import_source")
    .eq("search_id", searchId)
    .order("published_at", { ascending: false });

  if (format === "csv") {
    const cols = ["platform", "market", "author", "content", "sentiment", "topic", "subtopic", "ai_summary", "published_at", "import_source"];
    const escape = (v: unknown) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [cols.join(","), ...(mentions ?? []).map(m => cols.map(c => escape((m as Record<string, unknown>)[c])).join(","))];
    return new NextResponse(rows.join("\n"), {
      headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="fanometrix-mentions-${searchId.slice(0,8)}.csv"` },
    });
  }

  return NextResponse.json({ error: "Unknown format" }, { status: 400 });
}
