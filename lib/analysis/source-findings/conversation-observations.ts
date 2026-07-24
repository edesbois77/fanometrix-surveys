// Deterministic conversation/news findings, computed straight from classified
// mentions — no model call, so this stage CANNOT recreate the timeout. It mirrors
// the aggregation analyseConversation already does (sentiment split, per-market,
// top topics) but emits discrete, citable findings instead of a prose report.
//
// PURE. Testable without a database.
import type { SourceKind, EvidenceStrength } from "@/lib/analysis/source-findings/types";

export type Mention = {
  content: string | null;
  sentiment: string | null;     // 'Positive' | 'Neutral' | 'Negative'
  topic: string | null;
  market: string | null;
  platform: string | null;
  contentKind: string | null;   // 'article' marks news
};

export type ConversationFinding = {
  bucket: SourceKind;           // news | youtube | bluesky | reddit | conversation
  statement: string;
  scope: string | null;
  strength: EvidenceStrength;
  citation: { snippet: string; provenance: string | null };
};

/** A mention below this in a bucket is too thin to read a bucket-level finding
 *  off. */
const MIN_BUCKET = 5;
const MAX_MARKETS = 2;
const MAX_TOPICS = 2;

export function bucketOf(m: Pick<Mention, "contentKind" | "platform">): SourceKind {
  if (m.contentKind === "article") return "news";
  const p = (m.platform ?? "").toLowerCase();
  if (p.includes("youtube")) return "youtube";
  if (p.includes("bluesky") || p.includes("bsky")) return "bluesky";
  if (p.includes("reddit")) return "reddit";
  return "conversation";
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const quote = (m: Mention | undefined): { snippet: string; provenance: string | null } | null =>
  m?.content ? { snippet: m.content.slice(0, 220), provenance: [m.platform, m.market].filter(Boolean).join(" · ") || null } : null;

function strengthFor(n: number): EvidenceStrength {
  return n >= 50 ? "moderate" : "limited";
}

/** Findings for one bucket of mentions (all already the same SourceKind). */
function bucketFindings(bucket: SourceKind, mentions: Mention[]): ConversationFinding[] {
  const out: ConversationFinding[] = [];
  const total = mentions.length;
  if (total < MIN_BUCKET) return out;
  const strength = strengthFor(total);

  const pos = mentions.filter(m => m.sentiment === "Positive");
  const neg = mentions.filter(m => m.sentiment === "Negative");
  const neu = mentions.filter(m => m.sentiment === "Neutral");

  // Overall sentiment.
  const overallQuote = quote(pos[0] ?? neg[0] ?? mentions[0]);
  if (overallQuote) {
    out.push({
      bucket,
      statement: `Across ${total} ${bucket === "news" ? "articles" : "posts"}, sentiment was ${pct(pos.length, total)}% positive, ${pct(neu.length, total)}% neutral and ${pct(neg.length, total)}% negative.`,
      scope: `${total} ${bucket === "news" ? "articles" : "conversations"}`,
      strength,
      citation: overallQuote,
    });
  }

  // Per-market sentiment (biggest markets first).
  const byMarket = new Map<string, Mention[]>();
  for (const m of mentions) {
    const mk = (m.market ?? "").trim();
    if (!mk) continue;
    byMarket.set(mk, [...(byMarket.get(mk) ?? []), m]);
  }
  const markets = [...byMarket.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, MAX_MARKETS);
  for (const [market, ms] of markets) {
    if (ms.length < MIN_BUCKET) continue;
    const mp = ms.filter(m => m.sentiment === "Positive").length;
    const mn = ms.filter(m => m.sentiment === "Negative").length;
    const c = quote(ms.find(m => !!m.content));
    if (!c) continue;
    out.push({
      bucket,
      statement: `In ${market}, ${bucket === "news" ? "coverage" : "conversation"} was ${pct(mp, ms.length)}% positive and ${pct(mn, ms.length)}% negative (${ms.length} mentions).`,
      scope: `${market} (n=${ms.length})`,
      strength: strengthFor(ms.length),
      citation: c,
    });
  }

  // Top topics by volume.
  const byTopic = new Map<string, Mention[]>();
  for (const m of mentions) {
    const t = (m.topic ?? "").trim();
    if (!t) continue;
    byTopic.set(t, [...(byTopic.get(t) ?? []), m]);
  }
  const topics = [...byTopic.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, MAX_TOPICS);
  for (const [topic, ms] of topics) {
    const c = quote(ms.find(m => !!m.content));
    if (!c) continue;
    out.push({
      bucket,
      statement: `"${topic}" was among the most-discussed themes (${ms.length} mentions).`,
      scope: `${ms.length} mentions`,
      strength: strengthFor(ms.length),
      citation: c,
    });
  }

  return out;
}

/** Turn a search's classified mentions into discrete, citable findings, grouped
 *  by the platform bucket each belongs to. */
export function conversationObservations(mentions: Mention[]): ConversationFinding[] {
  const byBucket = new Map<SourceKind, Mention[]>();
  for (const m of mentions) {
    const b = bucketOf(m);
    byBucket.set(b, [...(byBucket.get(b) ?? []), m]);
  }
  return [...byBucket.entries()].flatMap(([bucket, ms]) => bucketFindings(bucket, ms));
}
