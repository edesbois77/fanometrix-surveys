// ── Validating the configuration claim an in-flight session sends back ───────
//
// The serve response carries configuration_revision_id. The client echoes it on
// every event, answer and submission so that evidence produced minutes after a
// configuration change is still attributed to the configuration that produced
// it, rather than to whatever happens to be effective when the row lands.
//
// That echo is a CLIENT CLAIM and is checked, never trusted. Two things follow:
//
//   • An invalid claim does not fail the write. Telemetry and answers are more
//     valuable than provenance: a forged or stale revision id resolves to NULL
//     and the row is still recorded, exactly as it would have been before WP1.
//     Rejecting the write would let anyone suppress a competitor's evidence by
//     sending junk.
//   • A valid claim means the revision EXISTS, was not cancelled, and its
//     effective_at had passed — it WAS ELIGIBLE TO GOVERN A SERVE. It does not
//     mean this session received it. WP1 keeps no assignment ledger, so that
//     stronger statement is not available and must not be implied downstream.
//
// The validating read is cached in-process for a few seconds. A revision is
// immutable once effective (migration 211 freeze triggers), so the only state
// that can change underneath the cache is cancellation — and a cancellation
// takes effect for new sessions immediately regardless, because it is the
// SERVE path that stops offering the revision.

import { supabaseAdmin } from "@/lib/supabase-admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cheap shape check, before any database work. */
export function looksLikeRevisionId(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

type CacheEntry = { valid: boolean; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5_000;
const CACHE_MAX = 5_000; // bounded so a flood of forged ids cannot grow it without limit

function cacheGet(id: string, now: number): boolean | null {
  const hit = cache.get(id);
  if (!hit) return null;
  if (hit.expiresAt <= now) { cache.delete(id); return null; }
  return hit.valid;
}

function cacheSet(id: string, valid: boolean, now: number): void {
  if (cache.size >= CACHE_MAX) {
    // Drop the oldest insertion. Map preserves insertion order, so this is the
    // first key. Cheaper and more predictable than a full sweep on a hot path.
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(id, { valid, expiresAt: now + CACHE_TTL_MS });
}

/** Testing seam — the module keeps process-wide state. */
export function __resetClaimCache(): void { cache.clear(); surveyCache.clear(); }

/**
 * Resolve a claimed revision id to a value safe to persist.
 *
 * Returns the id when the revision was eligible to govern a serve, and null in
 * every other case: malformed, unknown, cancelled, or not yet effective.
 */
export async function resolveRevisionClaim(
  claimed: unknown,
  nowMs: number = Date.now(),
): Promise<string | null> {
  if (!looksLikeRevisionId(claimed)) return null;

  const cached = cacheGet(claimed, nowMs);
  if (cached !== null) return cached ? claimed : null;

  const { data } = await supabaseAdmin
    .from("campaign_group_revisions")
    .select("id, effective_at, cancelled_at")
    .eq("id", claimed)
    // A cancelled revision was withdrawn before it could take effect and must
    // never be recorded as having governed anything.
    .is("cancelled_at", null)
    .maybeSingle();

  const valid = !!data && new Date(data.effective_at as string).getTime() <= nowMs;
  cacheSet(claimed, valid, nowMs);
  return valid ? claimed : null;
}

/**
 * The campaign's survey, resolved SERVER-SIDE from the campaign slug.
 *
 * survey_events.survey_id (migration 213) exists so evidence can be read by
 * survey without joining through campaigns. It is deliberately not taken from
 * the request body: a client that could name the survey could attribute its
 * answers to someone else's.
 */
const surveyCache = new Map<string, { surveyId: string | null; expiresAt: number }>();
const SURVEY_CACHE_TTL_MS = 30_000;

export async function resolveSurveyIdForCampaign(
  campaignSlug: unknown,
  nowMs: number = Date.now(),
): Promise<string | null> {
  if (typeof campaignSlug !== "string" || !campaignSlug || campaignSlug.length > 200) return null;

  const hit = surveyCache.get(campaignSlug);
  if (hit && hit.expiresAt > nowMs) return hit.surveyId;

  const { data } = await supabaseAdmin
    .from("campaigns")
    .select("survey_id")
    .eq("campaign_id", campaignSlug)
    .is("deleted_at", null)
    .maybeSingle();

  const surveyId = (data?.survey_id as string | null) ?? null;
  if (surveyCache.size >= CACHE_MAX) {
    const oldest = surveyCache.keys().next();
    if (!oldest.done) surveyCache.delete(oldest.value);
  }
  surveyCache.set(campaignSlug, { surveyId, expiresAt: nowMs + SURVEY_CACHE_TTL_MS });
  return surveyId;
}
