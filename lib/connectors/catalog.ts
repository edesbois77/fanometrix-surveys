// Client-safe connector catalog: the display + advanced-config metadata the
// configuration UI needs, with NO server-only imports (the connector
// implementations, which read env and call external APIs, live separately in
// lib/connectors/*). Adding a connector's advanced options to the form is a
// data change here — the form renders whatever a connector declares.
export type ConnectorField =
  | { key: string; type: "number"; label: string; help?: string; default: number }
  | { key: string; type: "string[]"; label: string; help?: string };

export type ConnectorCatalogEntry = {
  id: string;                 // connector id (matches lib/connectors registry + connector_config key)
  platformIds: string[];      // social-taxonomy PLATFORMS ids this maps from (lowercased)
  name: string;
  /** Fields shown in the form's Advanced section; empty = no advanced options. */
  advanced: ConnectorField[];
};

export const CONNECTOR_CATALOG: ConnectorCatalogEntry[] = [
  {
    id: "youtube", platformIds: ["youtube"], name: "YouTube",
    advanced: [
      { key: "max_videos", type: "number", label: "Max videos per run", help: "Higher collects more but uses more API quota.", default: 15 },
      { key: "comments_per_video", type: "number", label: "Comments per video", default: 20 },
    ],
  },
  {
    id: "bluesky", platformIds: ["bluesky"], name: "Bluesky",
    advanced: [
      { key: "max_posts", type: "number", label: "Max posts per run", help: "Matched posts; replies and quote posts are collected on top.", default: 60 },
      { key: "replies_per_post", type: "number", label: "Replies per post", help: "Replies and quote posts carry the richest discussion.", default: 25 },
    ],
  },
  {
    id: "news", platformIds: ["news"], name: "News",
    advanced: [
      { key: "max_articles", type: "number", label: "Max articles per run", help: "Editorial coverage is headline-level; higher collects more outlets.", default: 50 },
    ],
  },
  {
    id: "reddit", platformIds: ["reddit"], name: "Reddit",
    advanced: [
      { key: "subreddits", type: "string[]", label: "Target subreddits", help: "Comma-separated, e.g. soccer, football." },
    ],
  },
];

export function connectorForPlatformId(platformId: string): ConnectorCatalogEntry | null {
  const p = platformId.trim().toLowerCase();
  return CONNECTOR_CATALOG.find(c => c.platformIds.includes(p)) ?? null;
}

// Relative time-period presets. Stored on the search as collect_window; the
// pipeline resolves the actual window at each run so "Last 90 days" stays
// current. Only "custom" uses explicit collect_from/collect_to dates.
export const COLLECTION_WINDOWS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "1y", label: "Last year" },
  { value: "custom", label: "Custom" },
] as const;

// Common collection languages (ISO 639-1) for the config form.
export const COLLECTION_LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" }, { code: "de", label: "German" }, { code: "fr", label: "French" },
  { code: "es", label: "Spanish" }, { code: "it", label: "Italian" }, { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" }, { code: "sv", label: "Swedish" }, { code: "ar", label: "Arabic" },
];
