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
import { classifyArticle } from "@/lib/news-classify";
import { getProjectResearchQuestionForSearch } from "@/lib/research-sources/project-searches";
import { resolveInformationNeeds } from "@/lib/research-sources/information-needs";
import { asEvidenceRole } from "@/lib/evidence-role";
import { flattenNeeds } from "@/lib/information-needs";
import { submitForApproval } from "@/lib/evidence-review";
import { getConnector, connectorIdForPlatform } from "@/lib/connectors";
import type { CollectContext, NormalisedItem } from "@/lib/connectors/types";
import type { SearchStrategy } from "@/lib/search-strategy";

const CLASSIFY_CONCURRENCY = 8;
const DEFAULT_RELEVANCE_THRESHOLD = 50; // 0–100; below this, evidence is hidden by default

type SearchRow = {
  id: string; name: string; description: string | null;
  markets: string[] | null; platforms: string[] | null; languages: string[] | null;
  collect_from: string | null; collect_to: string | null;
  connector_config: Record<string, Record<string, unknown>> | null;
  entity_type: string | null; research_goal: string | null; is_simulated: boolean | null;
  collect_window: string | null; relevance_threshold: number | null;
  search_strategy: SearchStrategy | null;
  reddit_subreddits: string[] | null; // legacy — TODO remove once configs migrate to connector_config
  social_keywords: { keyword: string }[] | null;
};

// Resolve the actual date window for a run. Relative presets are computed
// against "now" so "Last 90 days" always means the 90 days before THIS run;
// only 'custom' (or a legacy null) uses the stored collect_from/collect_to.
const WINDOW_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 };
function resolveWindow(collectWindow: string | null, from: string | null, to: string | null): { dateFrom: string | null; dateTo: string | null } {
  const days = collectWindow ? WINDOW_DAYS[collectWindow] : undefined;
  if (days) {
    const now = new Date();
    return { dateFrom: new Date(now.getTime() - days * 86_400_000).toISOString(), dateTo: now.toISOString() };
  }
  return { dateFrom: from ? new Date(from).toISOString() : null, dateTo: to ? new Date(to).toISOString() : null };
}

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
    .select("id, name, description, markets, platforms, languages, collect_from, collect_to, collect_window, connector_config, entity_type, research_goal, is_simulated, relevance_threshold, search_strategy, evidence_role, reddit_subreddits, social_keywords(keyword)")
    .eq("id", opts.searchId)
    .single<SearchRow>();

  if (sErr || !search) throw new Error("Search not found");
  if (search.is_simulated) throw new Error("This search belongs to a simulated project and cannot collect live data.");

  const keywords = (search.social_keywords ?? []).map(k => k.keyword).filter(Boolean);

  // Stage 2 anchor: the search's own Research Question (its description), else
  // the project's. Relevance is judged against this — not against the keywords.
  const researchQuestion = (search.description?.trim())
    || (await getProjectResearchQuestionForSearch(search.id))
    || null;
  const threshold = search.relevance_threshold ?? DEFAULT_RELEVANCE_THRESHOLD;

  // Resolve which connectors to run: explicit list, else the search's platforms.
  const requestedIds = (opts.connectorIds && opts.connectorIds.length
    ? opts.connectorIds
    : (search.platforms ?? []).map(connectorIdForPlatform).filter((x): x is string => !!x));
  const connectors = Array.from(new Set(requestedIds))
    .map(getConnector)
    .filter((c): c is NonNullable<typeof c> => !!c);

  const runnable = connectors.filter(c => c.isConfigured());
  const notConfigured = connectors.filter(c => !c.isConfigured()).map(c => c.name);

  // Resolve the relative window once for this run.
  const window = resolveWindow(search.collect_window, search.collect_from, search.collect_to);

  // Snapshot the exact config this run used, so the run stays reproducible even
  // after the search definition later changes.
  const configSnapshot = {
    keywords,
    markets: search.markets ?? [],
    languages: search.languages ?? [],
    collect_window: search.collect_window,
    collect_from: window.dateFrom,
    collect_to: window.dateTo,
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

  // ── The current evidence base for this search (append-only diff basis) ────
  // Fetched up-front so incremental connectors know what's already stored and
  // fetch only genuinely new child evidence (docs/evidence-lifecycle.md).
  const { data: existingRows } = await supabaseAdmin
    .from("social_mentions")
    .select("id, connector, external_id, metadata")
    .eq("search_id", search.id)
    .not("external_id", "is", null);
  const idByKey = new Map<string, string>();
  const metaById = new Map<string, unknown>();
  const knownExternalIds = new Set<string>();
  // Syndication keys already held, for sources whose items get republished (News).
  // Without this, the same press release picked up by another outlet in a later
  // run would be a NEW external_id and would read as a second, independent piece
  // of evidence. Sources that set no syndication_key are unaffected.
  const knownSyndicationKeys = new Set<string>();
  for (const r of (existingRows ?? []) as { id: string; connector: string | null; external_id: string | null; metadata: unknown }[]) {
    idByKey.set(`${r.connector}:${r.external_id}`, r.id);
    metaById.set(r.id, r.metadata);
    if (r.external_id) knownExternalIds.add(r.external_id);
    const key = (r.metadata as { syndication_key?: unknown } | null)?.syndication_key;
    if (typeof key === "string" && key) knownSyndicationKeys.add(key);
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
      dateFrom: window.dateFrom,
      dateTo: window.dateTo,
      config,
      knownExternalIds,
      knownSyndicationKeys,
      strategy: search.search_strategy,
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

  // ── Diff against the base: genuinely NEW items vs. re-observed existing ────
  // Never re-import or re-classify evidence already in the base.
  const newItems: typeof unique = [];
  const reobservedPairs: { id: string; item: NormalisedItem }[] = [];
  for (const c of unique) {
    const existingId = c.item.external_id ? idByKey.get(`${c.connectorId}:${c.item.external_id}`) : undefined;
    if (existingId) reobservedPairs.push({ id: existingId, item: c.item });
    else newItems.push(c);   // no external_id → cannot dedup → treated as new
  }
  const reobservedIds = new Set(reobservedPairs.map(p => p.id));

  // ── Stage 2: classify ONLY new items, then append them to the base.
  // (sentiment/topic + entities/relevance/rationale/confidence). Store
  // EVERYTHING — relevance decides what SURFACES later, never what is kept.
  // Relevance is judged against the Information Needs when they are defined
  // (research-led); older searches fall back to the research question + primary
  // subject. This is the shift from listening to research. Needs come through the
  // resolver, so this pipeline doesn't depend on WHERE they are stored — when
  // they move to the project's Research Design, only the resolver changes.
  const informationNeeds = flattenNeeds(await resolveInformationNeeds({ searchId: search.id }));
  // WHY this search collects. Governs the relevance test applied to every item,
  // and is stamped on each row so the role travels into Analysis.
  const evidenceRole = asEvidenceRole((search as { evidence_role?: unknown }).evidence_role);
  const classifyCtx = { keywords, entityType: search.entity_type ?? undefined, researchGoal: search.research_goal ?? undefined, researchQuestion: researchQuestion ?? undefined, primarySubject: search.search_strategy?.primary_entity?.term ?? undefined, informationNeeds: informationNeeds.length ? informationNeeds : undefined, evidenceRole };

  // ARTICLES ARE NOT CONVERSATION. An 'article' content kind is routed to the
  // news classifier instead, which judges what a PUBLICATION printed — what kind
  // of statement it is, who is making the claim, and whether the piece contains
  // any actual evidence of fan reaction. Running the fan-conversation prompt over
  // a press release is precisely how coverage tone becomes "fans think…", so the
  // split is made here, generically on content kind, rather than per connector.
  const newsCtx = {
    researchQuestion: researchQuestion ?? undefined,
    requirement: (search.search_strategy as { design_origin?: { requirement?: string } } | null)?.design_origin?.requirement,
    informationNeeds: informationNeeds.length ? informationNeeds : undefined,
    primarySubject: search.search_strategy?.primary_entity?.term ?? undefined,
    evidenceRole,
  };

  const rows: Record<string, unknown>[] = new Array(newItems.length);
  for (let i = 0; i < newItems.length; i += CLASSIFY_CONCURRENCY) {
    const slice = newItems.slice(i, i + CLASSIFY_CONCURRENCY);
    await Promise.all(slice.map(async ({ connectorId, platform, item }, j) => {
      const meta = (item.metadata ?? {}) as Record<string, unknown>;
      const isArticle = item.content_kind === "article";
      const article = isArticle && item.content.trim()
        ? await classifyArticle(item.content, {
            ...newsCtx,
            publisher: typeof meta.publisher === "string" ? meta.publisher : undefined,
            publisherTier: typeof meta.publisher_tier === "string" ? meta.publisher_tier : undefined,
            author: item.author ?? undefined,
            publishedAt: item.published_at ?? undefined,
          })
        : null;
      const c = article ?? (!isArticle && item.content.trim() ? await classifyContent(item.content, classifyCtx) : null);
      rows[i + j] = {
        search_id: search.id, collection_run_id: runId, collected_at: startedAt,
        first_seen_at: startedAt, first_seen_run_id: runId, last_seen_at: startedAt, last_seen_run_id: runId,
        connector: connectorId, platform, content_kind: item.content_kind,
        external_id: item.external_id, parent_external_id: item.parent_external_id,
        author: item.author, source_url: item.source_url, content: item.content,
        published_at: item.published_at, market: item.market, language: item.language ?? "en",
        // News provenance rides on metadata (jsonb) rather than new columns:
        // source type, who is claiming it, whether the claim is established, and
        // whether the article carries any actual fan evidence.
        metadata: article ? { ...item.metadata, news: article.news } : item.metadata,
        import_source: `${connectorId}_api`, is_simulated: false,
        sentiment: c?.sentiment ?? null, topic: c?.topic ?? null, subtopic: c?.subtopic ?? null,
        ai_summary: c?.ai_summary ?? null, entities: c?.entities ?? null,
        relevance_score: c?.relevance ?? null, confidence: c?.confidence ?? null,
        relevance_rationale: c?.relevance_rationale ?? null, relevance_confidence: c?.confidence_label ?? null,
        research_aspect: c?.research_aspect ?? null,
        information_need: c?.information_need ?? null,
        evidence_role: evidenceRole,
      };
    }));
  }

  // ── Append new base rows (chunked), capturing their ids for observations ──
  let inserted = 0;
  const newIds: string[] = [];
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { data, error: insErr } = await supabaseAdmin.from("social_mentions").insert(chunk).select("id");
    if (insErr) warnings.push(`Insert error: ${insErr.message}`);
    else { inserted += chunk.length; for (const d of (data ?? []) as { id: string }[]) newIds.push(d.id); }
  }

  // ── Re-observe existing rows: refresh last_seen always, and mutable metadata
  // (view/like/comment counts) in place where it changed — never re-import,
  // never re-classify. Metadata change => "updated"; unchanged => "duplicate".
  const stableMeta = (m: unknown) => { try { return JSON.stringify(m ?? null); } catch { return ""; } };

  // The connector owns most of metadata, but NOT all of it: classification adds
  // fields afterwards that the connector cannot know about (News provenance —
  // source type, attribution, claim basis, fan evidence). Replacing metadata
  // wholesale with the connector's fresh copy would erase them on the first
  // re-observation, and because a re-observed item is deliberately never
  // re-classified, they would be gone for good. It would also make every article
  // compare as "changed" and inflate updated_count. So pipeline-added keys are
  // carried over, and the comparison is like-for-like.
  const PIPELINE_OWNED_META_KEYS = ["news"] as const;
  const withPreserved = (fresh: unknown, stored: unknown): Record<string, unknown> => {
    const f = (fresh ?? {}) as Record<string, unknown>;
    const s = (stored ?? {}) as Record<string, unknown>;
    const carried: Record<string, unknown> = {};
    for (const k of PIPELINE_OWNED_META_KEYS) if (k in s) carried[k] = s[k];
    return { ...f, ...carried };
  };

  const changedMeta: { id: string; metadata: unknown }[] = [];
  const unchangedIds: string[] = [];
  for (const { id, item } of reobservedPairs) {
    const stored = metaById.get(id);
    const merged = withPreserved(item.metadata, stored);
    if (stableMeta(merged) !== stableMeta(stored)) changedMeta.push({ id, metadata: merged });
    else unchangedIds.push(id);
  }
  const updatedCount = changedMeta.length;
  for (let i = 0; i < unchangedIds.length; i += 200) {
    await supabaseAdmin.from("social_mentions")
      .update({ last_seen_at: startedAt, last_seen_run_id: runId })
      .in("id", unchangedIds.slice(i, i + 200));
  }
  for (const { id, metadata } of changedMeta) {
    await supabaseAdmin.from("social_mentions")
      .update({ last_seen_at: startedAt, last_seen_run_id: runId, metadata })
      .eq("id", id);
  }
  const reobserved = [...reobservedIds];

  // ── Observations ledger: one row per item ENCOUNTERED this run (new + re-seen).
  const observations = [...newIds, ...reobserved].map(id => ({ mention_id: id, collection_run_id: runId, search_id: search.id, observed_at: startedAt }));
  for (let i = 0; i < observations.length; i += 100) {
    await supabaseAdmin.from("evidence_observations")
      .upsert(observations.slice(i, i + 100), { onConflict: "mention_id,collection_run_id", ignoreDuplicates: true });
  }

  // ── Cumulative base size after this run (the "total evidence" figure). ─────
  const { count: totalAfter } = await supabaseAdmin
    .from("social_mentions").select("id", { count: "exact", head: true }).eq("search_id", search.id);

  // ── Ledger stats — describe what this run ADDED (by_kind over new items). ──
  const byKind: Record<string, number> = {};
  const bySentiment: Record<string, number> = {};
  const byTopic: Record<string, number> = {};
  const entityCounts: Record<string, number> = {};
  let relevant = 0, lowRelevance = 0;
  for (const r of rows) {
    const rs = r.relevance_score;
    if (typeof rs === "number") { if (Math.round(rs * 100) >= threshold) relevant++; else lowRelevance++; }
    byKind[String(r.content_kind)] = (byKind[String(r.content_kind)] ?? 0) + 1;
    // Articles are excluded from the sentiment roll-up on purpose. An article's
    // sentiment is the TONE OF THE COVERAGE, not an audience's feeling, and this
    // roll-up is what the workspace renders as "% positive". Counting coverage
    // tone there would present favourable press as fan approval — the exact
    // conflation the news safeguards exist to prevent.
    if (r.content_kind !== "video" && r.content_kind !== "article") {
      if (r.sentiment) bySentiment[String(r.sentiment)] = (bySentiment[String(r.sentiment)] ?? 0) + 1;
      if (r.topic) byTopic[String(r.topic)] = (byTopic[String(r.topic)] ?? 0) + 1;
      if (Array.isArray(r.entities)) {
        for (const e of r.entities as { name?: string }[]) { if (e?.name) entityCounts[e.name] = (entityCounts[e.name] ?? 0) + 1; }
      }
    }
  }
  const topEntities = Object.entries(entityCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));

  // A run that collected items but added nothing new is COMPLETE (nothing new),
  // never "failed". Failure is reserved for a run that collected nothing at all
  // because every connector errored.
  const newCount = inserted;
  const duplicateCount = reobserved.length - updatedCount;  // re-seen with nothing new
  const status: RunCollectionResult["status"] =
    collected.length === 0 && fatalCount > 0 ? "failed"
    : (fatalCount > 0 || warnings.length > 0) ? "partial" : "completed";

  const ledger = {
    new_count: newCount, updated_count: updatedCount, duplicate_count: duplicateCount, total_after: totalAfter ?? null,
    by_kind: byKind, by_sentiment: bySentiment, by_topic: byTopic, top_entities: topEntities,
    matched: unique.length, relevant, low_relevance: lowRelevance, relevance_threshold: threshold,
  };
  await finalise(status, newCount, ledger);

  // Evidence Validation gate: a run that added genuinely new evidence needs
  // (re-)approval before it feeds Analysis. Duplicate-/metadata-only runs leave
  // an approved search approved. (docs/evidence-validation-blueprint.md §3)
  if (newCount > 0) {
    try { await submitForApproval(search.id, runId); } catch { /* gate is best-effort; never fail a collection over it */ }
  }

  return {
    runId, status, inserted: newCount,
    connectorsRun: runnable.map(c => c.id),
    stats: { new_count: newCount, updated_count: updatedCount, duplicate_count: duplicateCount, total_after: totalAfter ?? null, by_kind: byKind, by_sentiment: bySentiment, relevant, low_relevance: lowRelevance, relevance_threshold: threshold, connectors: connectorStats },
    warnings,
    error: collected.length === 0 && fatalCount > 0 ? (warnings[0] ?? "No items collected") : undefined,
  };
}
