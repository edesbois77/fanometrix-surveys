// Connector registry. Every live Conversation Intelligence source registers here
// once; the shared pipeline and the config UI discover connectors through this
// map, so adding News / Bluesky / Google Trends / a forum is: implement the
// Connector contract, add one line here. No pipeline or schema change.
import type { Connector } from "@/lib/connectors/types";
import { youtubeConnector } from "@/lib/connectors/youtube";
import { redditConnector } from "@/lib/connectors/reddit";

export const CONNECTORS: Record<string, Connector> = {
  [youtubeConnector.id]: youtubeConnector,
  [redditConnector.id]: redditConnector,
};

/** Map a search's platforms[] value (display label or id) to a connector id. */
export function connectorIdForPlatform(platform: string): string | null {
  const p = platform.trim().toLowerCase();
  const hit = Object.values(CONNECTORS).find(c => c.id === p || c.platform.toLowerCase() === p || c.name.toLowerCase() === p);
  return hit?.id ?? null;
}

export function getConnector(id: string): Connector | null {
  return CONNECTORS[id] ?? null;
}

export type { Connector } from "@/lib/connectors/types";
