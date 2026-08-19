// ── Server-resolved delivery context for a survey answer (server-only) ───────
//
// The embed can only ever assert what its URL told it. Publisher, market, delivery
// language, the effective Survey and the Campaign Group are properties of the
// CAMPAIGN, and the server already knows them — so they are resolved here rather
// than trusted from the browser. This is what makes an answer row self-describing
// enough to analyse per publisher / per market / (later) per Campaign Group.
//
// Shared by POST /api/answer (every selection) and POST /api/submit (the completion
// backfill), so both write an identical contract.
//
// CACHING: a live campaign is resolved thousands of times per minute during a burst,
// and its context is effectively static for the life of the campaign. A short TTL
// cache keeps the hot answer path to zero DB round-trips without ever serving stale
// context for more than a minute. Unknown slugs are negative-cached for a shorter
// window so junk / probe traffic cannot turn into a database amplifier.

import { supabaseAdmin } from "@/lib/supabase-admin";

export type CampaignEvidenceContext = {
  /** campaigns.campaign_id (the embed slug). */
  campaignId: string;
  /** campaigns.id — the uuid, for callers that need the internal key. */
  campaignUuid: string;
  /** Simulated campaigns never carry real respondent evidence (migration 084). */
  isSimulated: boolean;
  /** Effective survey: the campaign's own, else its Research Project's default. */
  surveyId: string | null;
  /** Publisher organisation NAME (campaigns.publisher_org_id → organisations.name). */
  publisher: string | null;
  market: string | null;
  countryCode: string | null;
  surveyLanguage: string | null;
  /**
   * campaign_groups.group_id (slug) for the group this campaign belongs to, or null.
   * Recorded now purely so the evidence model is ready for Campaign Groups; nothing
   * in the current product reads it. A campaign in more than one group resolves to
   * the earliest-added membership, deterministically.
   */
  groupId: string | null;
};

type Entry = { value: CampaignEvidenceContext | null; expiresAt: number };

const TTL_FOUND_MS = 60_000;
const TTL_MISSING_MS = 15_000;
const MAX_ENTRIES = 2_000;

const cache = new Map<string, Entry>();

/** Test-only: drop all cached context between cases. */
export function __resetEvidenceContextCache(): void {
  cache.clear();
}

function readCache(slug: string, now: number): Entry | undefined {
  const e = cache.get(slug);
  if (!e) return undefined;
  if (e.expiresAt <= now) { cache.delete(slug); return undefined; }
  return e;
}

function writeCache(slug: string, value: CampaignEvidenceContext | null, now: number): void {
  // Bounded: sweep expired entries first, then evict oldest-inserted (Map keeps
  // insertion order) so a flood of unknown slugs cannot grow this without limit.
  if (cache.size >= MAX_ENTRIES) {
    for (const [k, v] of cache) if (v.expiresAt <= now) cache.delete(k);
    while (cache.size >= MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }
  cache.set(slug, { value, expiresAt: now + (value ? TTL_FOUND_MS : TTL_MISSING_MS) });
}

/**
 * Resolve a campaign slug to its evidence context.
 * Returns null when the slug does not resolve to a real campaign — the caller should
 * reject rather than persist an unattributable answer. Deliberately does NOT check
 * campaign status: an answer given a moment after a campaign closed is still a real
 * answer, and status enforcement belongs to the completion path (/api/submit), which
 * owns the response ceiling.
 */
export async function resolveCampaignEvidenceContext(
  slug: string,
  now: number = Date.now(),
): Promise<CampaignEvidenceContext | null> {
  const hit = readCache(slug, now);
  if (hit) return hit.value;

  const { data: campaign } = await supabaseAdmin
    .from("campaigns")
    .select("id, campaign_id, survey_id, research_project_id, publisher_org_id, market, country_code, survey_language, is_simulated")
    .eq("campaign_id", slug)
    .maybeSingle();

  if (!campaign) {
    writeCache(slug, null, now);
    return null;
  }

  // Effective survey — mirrors /api/submit and the embed resolution exactly.
  let surveyId = (campaign.survey_id as string | null) ?? null;
  if (!surveyId && campaign.research_project_id) {
    const { data: proj } = await supabaseAdmin
      .from("research_projects").select("survey_id").eq("id", campaign.research_project_id).maybeSingle();
    surveyId = (proj?.survey_id as string | null) ?? null;
  }

  let publisher: string | null = null;
  if (campaign.publisher_org_id) {
    const { data: org } = await supabaseAdmin
      .from("organisations").select("name").eq("id", campaign.publisher_org_id).maybeSingle();
    publisher = (org?.name as string | null) ?? null;
  }

  // Campaign Group membership — nullable, future-facing, deterministic.
  let groupId: string | null = null;
  {
    const { data: member } = await supabaseAdmin
      .from("campaign_group_members")
      .select("group_id, added_at")
      .eq("campaign_id", campaign.id)
      .order("added_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (member?.group_id) {
      const { data: grp } = await supabaseAdmin
        .from("campaign_groups").select("group_id").eq("id", member.group_id).maybeSingle();
      groupId = (grp?.group_id as string | null) ?? null;
    }
  }

  const value: CampaignEvidenceContext = {
    campaignId: campaign.campaign_id as string,
    campaignUuid: campaign.id as string,
    isSimulated: !!campaign.is_simulated,
    surveyId,
    publisher,
    market: (campaign.market as string | null) ?? null,
    countryCode: (campaign.country_code as string | null) ?? null,
    surveyLanguage: (campaign.survey_language as string | null) ?? null,
    groupId,
  };
  writeCache(slug, value, now);
  return value;
}
