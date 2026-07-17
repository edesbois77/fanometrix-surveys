// The shared Conversation Intelligence collection pipeline.
//
// One run = one timestamped snapshot: create a collection_runs row, drive every
// enabled connector through the same flow (collect → within-run dedup →
// classify → store), then finalise the run with its stats. Raw history is
// preserved — each run inserts its own rows tagged with collection_run_id and
// collected_at, so the same external item recurs across runs (longitudinal
// analysis). Cross-run dedup is a read/display concern, never done here.
//
// Connectors are consulted generically via their capabilities; this file knows
// nothing YouTube- or Reddit-specific.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { classifyContent } from "@/lib/ai-classify";
import { getConnector, connectorIdForPlatform } from "@/lib/connectors";
import type { CollectContext, NormalisedItem } from "@/lib/connectors/types";

const CLASSIFY_CONCURRENCY = 8;

type SearchRow = {
  id: string; name: string;
  markets: string[] | null; platforms: string[] | null; languages: string[] | null;
  collect_from: string | null; collect_to: string | null;
  connector_config: Record<string, Record<string, unknown>> | null;
  entity_type: string | null; research_goal: string | null; is_simulated: boolean | null;
  reddit_subreddits: string[] | null; // legacy — TODO remove once configs migrate to connector_config
  social_keywords: { keyword: string }[] | null;
};

export type RunCollectionResult = {
  runId: string;
  status: "completed" | "partial" | "failed";
  inserted: number;
  connectorsRun: string[];
  stats: Record<string, unknown>;
  warnings: string[];
  error?: string;
};

export async function runCollection(opts: {
  searchId: string;
  connectorIds?: string[];
  triggeredBy?: string | null;
}): Promise<RunCollectionResult> {
  const { data: search, error: sErr } = await supabaseAdmin
    .from("social_searches")
    .select("id, name, markets, platforms, languages, collect_from, collect_to, connector_config, entity_type, research_goal, is_simulated, reddit_subreddits, social_keywords(keyword)")
    .eq("id", opts.searchId)
    .single<SearchRow>();

  if (sErr || !search) throw new Error("Search not found");
  if (search.is_simulated) throw new Error("This search belongs to a simulated project and cannot collect live data.");

  const keywords = (search.social_keywords ?? []).map(k => k.keyword).filter(Boolean);

  // Resolve which connectors to run: explicit list, else the search's platforms.
  const requestedIds = (opts.connectorIds && opts.connectorIds.length
    ? opts.connectorIds
    : (search.platforms ?? []).map(connectorIdForPlatform).filter((x): x is string => !!x));
  const connectors = Array.from(new Set(requestedIds))
    .map(getConnector)
    .filter((c): c is NonNullable<typeof c> => !!c);

  const runnable = connectors.filter(c => c.isConfigured());
  const notConfigured = connectors.filter(c => !c.isConfigured()).map(c => c.name);

  // Snapshot the exact config this run used, so the run stays reproducible even
  // after the search definition later changes.
  const configSnapshot = {
    keywords,
    markets: search.markets ?? [],
    languages: search.languages ?? [],
    collect_from: search.collect_from,
    collect_to: search.collect_to,
    connectors: runnable.map(c => c.id),
    connector_config: Object.fromEntries(runnable.map(c => [c.id, (search.connector_config ?? {})[c.id] ?? {}])),
  };

  // Open the run (the snapshot) up-front so it's visible while collecting.
  const startedAt = new Date().toISOString();
  const { data: run, error: rErr } = await supabaseAdmin
    .from("collection_runs")
    .insert({ search_id: search.id, connectors: runnable.map(c => c.id), status: "running", started_at: startedAt, config: configSnapshot, triggered_by: opts.triggeredBy ?? null })
    .select("id")
    .single<{ id: string }>();
  if (rErr || !run) throw new Error(`Could not open collection run: ${rErr?.message ?? "unknown"}`);
  const runId = run.id;

  const warnings: string[] = notConfigured.map(n => `${n} connector is not configured (missing API credentials) — skipped`);
  const connectorStats: Record<string, unknown> = {};
  let fatalCount = 0;

  const finalise = async (status: RunCollectionResult["status"], inserted: number, extraStats: Record<string, unknown>, error?: string) => {
    await supabaseAdmin.from("collection_runs").update({
      status, completed_at: new Date().toISOString(),
      stats: { inserted, connectors: connectorStats, ...extraStats },
      warnings, error: error ?? null,
    }).eq("id", runId);
  };

  if (!runnable.length) {
    await finalise("failed", 0, {}, "No configured connectors to run");
    return { runId, status: "failed", inserted: 0, connectorsRun: [], stats: { connectors: connectorStats }, warnings, error: "No configured connectors to run" };
  }

  // ── Collect from every connector ─────────────────────────────────────────
  const collected: { connectorId: string; platform: string; item: NormalisedItem }[] = [];
  for (const connector of runnable) {
    let config: Record<string, unknown> = (search.connector_config ?? {})[connector.id] ?? {};
    // Temporary compat: existing Reddit searches store subreddits in the legacy
    // reddit_subreddits column, not connector_config. Fall back to it until the
    // config is migrated, then this shim is removed.
    if (connector.id === "reddit" && !config.subreddits && search.reddit_subreddits?.length) {
      config = { ...config, subreddits: search.reddit_subreddits };
    }
    const ctx: CollectContext = {
      keywords,
      markets: search.markets ?? [],
      languages: search.languages ?? [],
      dateFrom: search.collect_from ? new Date(search.collect_from).toISOString() : null,
      dateTo: search.collect_to ? new Date(search.collect_to).toISOString() : null,
      config,
    };
    try {
      const result = await connector.collect(ctx);
      connectorStats[connector.id] = { ...result.stats, warnings: result.warnings.length };
      warnings.push(...result.warnings.map(w => `[${connector.name}] ${w}`));
      if (result.fatalError) { fatalCount++; warnings.push(`[${connector.name}] ${result.fatalError}`); }
      for (const item of result.items) collected.push({ connectorId: connector.id, platform: connector.platform, item });
    } catch (err) {
      fatalCount++;
      connectorStats[connector.id] = { error: err instanceof Error ? err.message : "collector threw" };
      warnings.push(`[${connector.name}] ${err instanceof Error ? err.message : "collector failed"}`);
    }
  }

  // ── Within-run dedup (same item twice via pagination/overlap) ─────────────
  const seen = new Set<string>();
  const unique = collected.filter(({ connectorId, item }) => {
    const key = `${connectorId}:${item.external_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // ── Classify (enriched: sentiment/topic + entities/relevance/confidence).
  // Store EVERYTHING — relevance decides what surfaces later, not what is kept.
  const classifyCtx = { keywords, entityType: search.entity_type ?? undefined, researchGoal: search.research_goal ?? undefined };
  const rows: Record<string, unknown>[] = new Array(unique.length);
  for (let i = 0; i < unique.length; i += CLASSIFY_CONCURRENCY) {
    const slice = unique.slice(i, i + CLASSIFY_CONCURRENCY);
    await Promise.all(slice.map(async ({ connectorId, platform, item }, j) => {
      const c = item.content.trim() ? await classifyContent(item.content, classifyCtx) : null;
      rows[i + j] = {
        search_id: search.id, collection_run_id: runId, collected_at: startedAt,
        connector: connectorId, platform, content_kind: item.content_kind,
        external_id: item.external_id, parent_external_id: item.parent_external_id,
        author: item.author, source_url: item.source_url, content: item.content,
        published_at: item.published_at, market: item.market, language: item.language ?? "en",
        metadata: item.metadata, import_source: `${connectorId}_api`, is_simulated: false,
        sentiment: c?.sentiment ?? null, topic: c?.topic ?? null, subtopic: c?.subtopic ?? null,
        ai_summary: c?.ai_summary ?? null, entities: c?.entities ?? null,
        relevance_score: c?.relevance ?? null, confidence: c?.confidence ?? null,
      };
    }));
  }

  // ── Insert (chunked) ─────────────────────────────────────────────────────
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error: insErr } = await supabaseAdmin.from("social_mentions").insert(chunk);
    if (insErr) warnings.push(`Insert error: ${insErr.message}`);
    else inserted += chunk.length;
  }

  // ── Snapshot stats + status ──────────────────────────────────────────────
  const byKind: Record<string, number> = {};
  const bySentiment: Record<string, number> = {};
  const byTopic: Record<string, number> = {};
  const entityCounts: Record<string, number> = {};
  for (const r of rows) {
    byKind[String(r.content_kind)] = (byKind[String(r.content_kind)] ?? 0) + 1;
    // AI-output rollups describe the conversation (comments/posts) — a video
    // title isn't a fan opinion, so videos are excluded from these mixes.
    if (r.content_kind !== "video") {
      if (r.sentiment) bySentiment[String(r.sentiment)] = (bySentiment[String(r.sentiment)] ?? 0) + 1;
      if (r.topic) byTopic[String(r.topic)] = (byTopic[String(r.topic)] ?? 0) + 1;
      if (Array.isArray(r.entities)) {
        for (const e of r.entities as { name?: string }[]) {
          if (e?.name) entityCounts[e.name] = (entityCounts[e.name] ?? 0) + 1;
        }
      }
    }
  }
  const topEntities = Object.entries(entityCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));
  const status: RunCollectionResult["status"] =
    inserted === 0 ? "failed" : (fatalCount > 0 || warnings.length > 0) ? "partial" : "completed";

  await finalise(status, inserted, { by_kind: byKind, by_sentiment: bySentiment, by_topic: byTopic, top_entities: topEntities, collected: unique.length });

  return {
    runId, status, inserted,
    connectorsRun: runnable.map(c => c.id),
    stats: { inserted, by_kind: byKind, by_sentiment: bySentiment, connectors: connectorStats },
    warnings,
    error: inserted === 0 ? (warnings[0] ?? "No items collected") : undefined,
  };
}
