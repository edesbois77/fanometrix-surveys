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
//   • A valid claim means the revision exists, belongs to a Survey Studio group,
//     belongs to the claimed group when one was claimed, was not cancelled, its
//     effective_at had passed, AND THE WRITING CAMPAIGN IS ONE OF ITS FROZEN
//     MEMBERS — it WAS ELIGIBLE TO GOVERN THIS SERVE. It does not mean this
//     session received it. WP1 keeps no assignment ledger, so that stronger
//     statement is not available and must not be implied downstream.
//
// THE TUPLE, NOT THE UUID. An earlier form of this function took the claimed id
// alone and checked only existence, cancellation and effectivity. That accepted
// ANY effective revision against ANY campaign: another group's revision could be
// replayed against this campaign and was stored on all three evidence tables.
// Resolving "the campaign's group" would not have fixed it either — a campaign
// may sit in several groups and in several revisions of each. Only the exact
// (revision, campaign, group-where-known) tuple, checked against that one
// revision's FROZEN membership, is authoritative.
//
// The validating read is cached in-process for a few seconds. A revision is
// immutable once effective (migration 211 freeze triggers), so the only state
// that can change underneath the cache is cancellation — and a cancellation
// takes effect for new sessions immediately regardless, because it is the
// SERVE path that stops offering the revision.

import { supabaseAdmin } from "@/lib/supabase-admin";
import { validateInFlightRevision, type RevisionValidationCode } from "./revision";
import type { Revision, RevisionMember } from "./model";
import { reportDeliveryIntegrity, type DeliveryIntegrityEndpoint } from "./delivery-integrity";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cheap shape check, before any database work. */
export function looksLikeRevisionId(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

type CacheEntry = { code: RevisionValidationCode; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5_000;
const CACHE_MAX = 5_000; // bounded so a flood of forged ids cannot grow it without limit

function cacheGet(id: string, now: number): RevisionValidationCode | null {
  const hit = cache.get(id);
  if (!hit) return null;
  if (hit.expiresAt <= now) { cache.delete(id); return null; }
  return hit.code;
}

function cacheSet(id: string, code: RevisionValidationCode, now: number): void {
  if (cache.size >= CACHE_MAX) {
    // Drop the oldest insertion. Map preserves insertion order, so this is the
    // first key. Cheaper and more predictable than a full sweep on a hot path.
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(id, { code, expiresAt: now + CACHE_TTL_MS });
}

/** Testing seam — the module keeps process-wide state. */
export function __resetClaimCache(): void { cache.clear(); surveyCache.clear(); }

/**
 * The outcome of checking an in-flight configuration claim.
 *
 * Deliberately NOT collapsed to `string | null` at this layer. The caller must
 * be able to tell "no claim was made" (an individual campaign, a legacy group —
 * ordinary, unremarkable) from "a claim was made and it was wrong" (a stale,
 * malformed or forged provenance assertion, which is an integrity signal). Both
 * store NULL; only one of them is news.
 */
export interface ClaimResolution {
  code: RevisionValidationCode;
  /** The id to persist. Non-null ONLY when code === "valid". */
  revisionId: string | null;
  /** True when a claim was supplied but refused — the diagnostic condition. */
  suppliedButInvalid: boolean;
}

const NO_CLAIM: ClaimResolution = { code: "no_claim", revisionId: null, suppliedButInvalid: false };

function refuse(code: RevisionValidationCode): ClaimResolution {
  return { code, revisionId: null, suppliedButInvalid: true };
}

/** What the request supplied, alongside the claim itself. */
export interface ClaimContext {
  /** campaigns.campaign_id — the slug the evidence row is being written for. */
  campaignSlug: unknown;
  /** The group slug the session claims, when the request carries one. */
  groupSlug?: unknown;
}

/**
 * Resolve a claimed revision id against the campaign (and group, where known)
 * the evidence is being written for.
 *
 * One authoritative server-side path: every endpoint that persists
 * configuration_revision_id resolves it here and nowhere else.
 */
export async function resolveRevisionClaim(
  claimed: unknown,
  ctx: ClaimContext,
  nowMs: number = Date.now(),
): Promise<ClaimResolution> {
  // Absent is not invalid. Individual campaigns and legacy groups send nothing
  // and must stay silent — they are the overwhelming majority of traffic.
  if (claimed === undefined || claimed === null || claimed === "") return NO_CLAIM;
  if (!looksLikeRevisionId(claimed)) return refuse("malformed_claim");

  const campaignSlug = typeof ctx.campaignSlug === "string" ? ctx.campaignSlug : "";
  const groupSlug = typeof ctx.groupSlug === "string" && ctx.groupSlug ? ctx.groupSlug : null;
  // A claim with no campaign to bind it to cannot be validated as a tuple, and
  // an unbindable claim must never be stored.
  if (!campaignSlug || campaignSlug.length > 200) return refuse("campaign_not_in_revision");

  // The cache key is the TUPLE, never the revision alone. Keying on the id
  // would let one genuine journey warm the cache for a forged one.
  const key = `${claimed}|${campaignSlug}|${groupSlug ?? "-"}`;
  const cached = cacheGet(key, nowMs);
  if (cached !== null) {
    return cached === "valid"
      ? { code: "valid", revisionId: claimed, suppliedButInvalid: false }
      : refuse(cached);
  }

  const { data } = await supabaseAdmin
    .from("campaign_group_revisions")
    .select(`
      id, effective_at, cancelled_at, created_at, rotation, change_kind, group_id,
      campaign_groups!campaign_group_revisions_group_id_fkey ( group_id, owner_model ),
      campaign_group_revision_members (
        weight, membership_state, campaign_id,
        campaigns!campaign_group_revision_members_campaign_id_fkey ( campaign_id )
      )
    `)
    .eq("id", claimed)
    .maybeSingle();

  const resolution = evaluateClaimRow(data, claimed, campaignSlug, groupSlug, nowMs);
  cacheSet(key, resolution.code, nowMs);
  return resolution;
}

/**
 * Shape the database row into the pure validator's inputs and delegate.
 *
 * Split out so the row→verdict mapping is testable without a database: the
 * request path and the tests exercise the SAME decision, not two lookalikes.
 */
export function evaluateClaimRow(
  row: unknown,
  claimedRevisionId: string,
  campaignSlug: string,
  groupSlug: string | null,
  nowMs: number,
): ClaimResolution {
  if (!row) return refuse("unknown_revision");
  const r = row as Record<string, unknown>;

  // PostgREST returns a to-one embed as an object, but typings (and older
  // planner shapes) allow an array. Normalise rather than assume.
  const rawGroup = r.campaign_groups;
  const group = (Array.isArray(rawGroup) ? rawGroup[0] : rawGroup) as
    | { group_id?: string; owner_model?: string } | null | undefined;
  if (!group) return refuse("unknown_revision");

  const rawMembers = (r.campaign_group_revision_members ?? []) as Array<Record<string, unknown>>;
  const members: RevisionMember[] = rawMembers.map(m => {
    const rawCampaign = m.campaigns;
    const campaign = (Array.isArray(rawCampaign) ? rawCampaign[0] : rawCampaign) as
      | { campaign_id?: string } | null | undefined;
    return {
      campaignId: String(m.campaign_id ?? ""),
      campaignSlug: String(campaign?.campaign_id ?? ""),
      weight: Number(m.weight ?? 1),
      membershipState: (m.membership_state as RevisionMember["membershipState"]) ?? "active",
    };
  });

  const revision: Revision = {
    id: String(r.id),
    groupId: String(r.group_id ?? ""),
    effectiveAt: new Date(String(r.effective_at)),
    createdAt: new Date(String(r.created_at ?? r.effective_at)),
    cancelledAt: r.cancelled_at ? new Date(String(r.cancelled_at)) : null,
    rotation: (r.rotation as Revision["rotation"]) ?? "equal",
    changeKind: String(r.change_kind ?? ""),
    reason: null,
    members,
  };

  const verdict = validateInFlightRevision(
    {
      revisionId: claimedRevisionId,
      campaignSlug,
      groupSlug,
      ownerModel: String(group.owner_model ?? ""),
      actualGroupSlug: String(group.group_id ?? ""),
    },
    [revision],
    new Date(nowMs),
  );

  return verdict.ok
    ? { code: "valid", revisionId: claimedRevisionId, suppliedButInvalid: false }
    : refuse(verdict.code);
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

/**
 * Resolve a claim AND report it when it was supplied but refused.
 *
 * Every evidence endpoint calls this rather than resolveRevisionClaim directly,
 * so the diagnostic can never be wired on one path and forgotten on another —
 * which is exactly how the original gap survived: one shared resolver, three
 * call sites, and no single place that had to be right.
 *
 * Returns only the id to persist. The rejection reason stays server-side: an
 * anonymous caller must not be able to tell "that revision does not exist" from
 * "that revision is not yours", or the endpoint becomes a probe for which
 * groups and revisions exist.
 */
export async function resolveClaimForWrite(
  claimed: unknown,
  ctx: ClaimContext & { sessionId?: unknown; endpoint: DeliveryIntegrityEndpoint },
  nowMs: number = Date.now(),
): Promise<string | null> {
  const resolution = await resolveRevisionClaim(claimed, ctx, nowMs);

  if (resolution.suppliedButInvalid) {
    reportDeliveryIntegrity({
      reason: resolution.code,
      claimedRevisionId: looksLikeRevisionId(claimed) ? claimed : null,
      campaignId: typeof ctx.campaignSlug === "string" ? ctx.campaignSlug : null,
      claimedGroupId: typeof ctx.groupSlug === "string" ? ctx.groupSlug : null,
      sessionId: typeof ctx.sessionId === "string" ? ctx.sessionId : null,
      endpoint: ctx.endpoint,
    }, nowMs);
  }

  return resolution.revisionId;
}

/**
 * Was a configuration claim MADE at all?
 *
 * Presence, not well-formedness. A malformed claim is still a claim, and must
 * be reported as one rather than filed alongside the individual-campaign and
 * legacy traffic that legitimately sends nothing.
 */
export function claimSupplied(v: unknown): boolean {
  return v !== undefined && v !== null && v !== "";
}
