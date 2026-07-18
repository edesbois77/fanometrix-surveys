// Client-safe content-kind vocabulary. Every connector labels its items with a
// content_kind ('video' | 'comment' | 'post' | 'article' | 'reply' | 'trend' |
// …). The UI renders collection counts generically from these, so a NEW
// connector's kinds (News → 'article', Bluesky → 'post'/'reply', Google Trends →
// 'trend') display with no UI change — an unknown kind falls back to a sensible
// label and is counted as a conversation. This is what lets a new evidence
// source plug into the same workflow without new UX.
export type ContentKindMeta = {
  singular: string;
  plural: string;
  /** True = a piece of the conversation (analysable). False = context/container. */
  conversation: boolean;
};

export const CONTENT_KINDS: Record<string, ContentKindMeta> = {
  video:   { singular: "video",   plural: "videos",   conversation: false },
  comment: { singular: "comment", plural: "comments", conversation: true  },
  post:    { singular: "post",    plural: "posts",    conversation: true  },
  reply:   { singular: "reply",   plural: "replies",  conversation: true  },
  article: { singular: "article", plural: "articles", conversation: true  },
  thread:  { singular: "thread",  plural: "threads",  conversation: true  },
  trend:   { singular: "trend",   plural: "trends",   conversation: false },
};

function meta(kind: string): ContentKindMeta {
  return CONTENT_KINDS[kind] ?? { singular: kind, plural: `${kind}s`, conversation: true };
}

/** "240 comments" / "1 video" — pluralised, localised. */
export function kindLabel(kind: string, n: number): string {
  const m = meta(kind);
  return `${n.toLocaleString()} ${n === 1 ? m.singular : m.plural}`;
}

/** "15 videos · 240 comments" — a human breakdown of everything collected. */
export function collectionBreakdown(byKind: Record<string, number>): string {
  const parts = Object.entries(byKind)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => kindLabel(k, n));
  return parts.join(" · ") || "no items";
}

/** The analysable "conversations" — comments, posts, replies, articles, … (not videos/trends). */
export function conversationCount(byKind: Record<string, number>): number {
  return Object.entries(byKind).filter(([k]) => meta(k).conversation).reduce((s, [, n]) => s + n, 0);
}

/** Every collected item, regardless of kind. */
export function totalItems(byKind: Record<string, number>): number {
  return Object.values(byKind).reduce((s, n) => s + (n || 0), 0);
}
