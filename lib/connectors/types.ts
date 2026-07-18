import type { SearchStrategy } from "@/lib/search-strategy";

// The generic Conversation Intelligence connector contract.
//
// A connector is one live source (YouTube, Reddit, News, Bluesky, Google Trends,
// a forum…). Each declares its CAPABILITIES so the shared collection pipeline and
// the UI adapt to it rather than assuming every source behaves the same — some
// have comments, some don't; some accept a region/language/date window, some
// don't; some need extra config (subreddits, feeds). The pipeline reads
// capabilities to decide how to call the connector; the UI reads them to render
// the right config fields and result counts.

/** What a connector can do — drives pipeline behaviour and config UI. */
export type ConnectorCapabilities = {
  /** Content kinds this connector can yield, e.g. ['video','comment'] | ['article'] | ['post','reply'] | ['trend']. */
  contentKinds: string[];
  /** Keyword search over the source. */
  supportsSearch: boolean;
  /** Fetches replies/comments on the primary items. */
  supportsComments: boolean;
  /** Honours a market/region filter. */
  supportsRegionFilter: boolean;
  /** Honours a language filter. */
  supportsLanguageFilter: boolean;
  /** Honours a published-after/before window. */
  supportsDateWindow: boolean;
  /** Returns paginated results the pipeline can page through (within caps). */
  paginated: boolean;
  /** Reliably discovers genuinely NEW child evidence since the last run (e.g.
   *  newest-first comment paging that stops at already-seen items) rather than
   *  re-fetching a fixed top-N sample. When true, the pipeline passes
   *  ctx.knownExternalIds so the connector can stop at what it already has. A
   *  connector that only ever returns a top-N sample must set this false. */
  incremental: boolean;
  /** connector_config keys this connector reads, with UI hints. */
  configSchema?: Record<string, { type: "number" | "text" | "string[]"; label: string; required?: boolean; default?: unknown }>;
  /** Rough quota note for operators (not enforced here). */
  quota?: { note: string };
  /** Env vars that must be present for the connector to run. */
  env: string[];
};

/** One normalised collected item — the connector's output, source-agnostic. */
export type NormalisedItem = {
  /** Stable per-source id used for within-run dedup (video id, comment id, post id…). */
  external_id: string;
  /** 'video' | 'comment' | 'post' | 'article' | 'trend' | … (must be in capabilities.contentKinds). */
  content_kind: string;
  /** Text to classify + store. Empty-string items are stored but not classified. */
  content: string;
  author: string | null;
  source_url: string | null;
  /** ISO timestamp, or null when the source has none. */
  published_at: string | null;
  market: string | null;
  language: string | null;
  /** Generic threading: the external_id of the parent item (comment → its video/post). */
  parent_external_id: string | null;
  /** Source-specific fields (channel, like_count, reply_count, view_count, subreddit…). */
  metadata: Record<string, unknown>;
};

/** Everything a connector needs for one collection run. */
export type CollectContext = {
  keywords: string[];
  /** Markets as stored on the search (names or ISO codes — connectors resolve as needed). */
  markets: string[];
  /** Language codes (ISO 639-1). May be empty. */
  languages: string[];
  /** ISO date-time bounds, or null when unbounded. */
  dateFrom: string | null;
  dateTo: string | null;
  /** This connector's slice of social_searches.connector_config. */
  config: Record<string, unknown>;
  /** External ids already in this search's evidence base. An incremental
   *  connector uses this to stop paging at already-seen items and fetch only
   *  genuinely new evidence. Absent/empty on a first run; non-incremental
   *  connectors ignore it (the pipeline dedups their output regardless). */
  knownExternalIds?: Set<string>;
  /** The compiled Search Strategy for this search. When present, a connector
   *  should compile it into its own native query (anchoring the primary subject
   *  to its context, applying exclusions) instead of using flat `keywords`.
   *  When absent, connectors fall back to `keywords` (unchanged behaviour). */
  strategy?: SearchStrategy | null;
};

/** A connector's result for one run — partial success is normal. */
export type CollectResult = {
  items: NormalisedItem[];
  /** Non-fatal issues (comments disabled on a video, a deleted item, a skipped page). */
  warnings: string[];
  /** Free-form counts for the run snapshot, e.g. { videos: 20, comments: 340 }. */
  stats: Record<string, number>;
  /** Set when the connector aborted early (e.g. quota exceeded) but returned what it had. */
  fatalError?: string;
};

export interface Connector {
  /** Stable id used in platforms[]/connector_config keys, e.g. 'youtube'. */
  id: string;
  /** Human label, e.g. 'YouTube'. */
  name: string;
  /** Value written to social_mentions.platform for display/back-compat, e.g. 'YouTube'. */
  platform: string;
  capabilities: ConnectorCapabilities;
  /** True when the required env vars are present. */
  isConfigured(): boolean;
  /** Run one collection. Must resolve (never reject) for partial failures — use warnings/fatalError. */
  collect(ctx: CollectContext): Promise<CollectResult>;
}
