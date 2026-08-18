// ── Survey Studio → Discover → Dashboards — entitlement-projected filter manifest ─
// Phase 1 foundation. The one genuinely new authorisation capability the audit
// identified: a server-resolved manifest of Dashboard filter dimensions + allowed
// values, projected ONLY from the authorised Campaign/data universe.
//
// THE LEAK RULE (non-negotiable): dimension values are NEVER produced by a global
// `SELECT DISTINCT` over campaigns / organisations / responses. They are projected
// from the caller's authorised Campaign set FIRST (lib/studio/dashboard-scope.ts).
// So a Publisher (or Market / Language) an org cannot access can never appear —
// e.g. FotMob's manifest can never contain LiveScore or Football365. Publisher
// NAMES are resolved only for org ids already present in the authorised campaigns,
// never from arbitrary client input.
//
// This EXTENDS the existing buildFilterOptions idea (lib/studio/survey-results.ts)
// rather than inventing a parallel filter architecture; filterCampaignSlugs is
// reused verbatim for the value→slug narrowing.

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { ScopeCampaign, DashboardDb } from "@/lib/studio/dashboard-scope";
import { filterCampaignSlugs, type ResultsFilters } from "@/lib/studio/survey-results";

/** The comparison dimensions the manifest can describe in V1. Deliberately the
 *  set safely resolvable from the Campaign model today (publisher/market/language/
 *  campaign). Response-level dimensions (device/browser/placement/creative/…) are
 *  an explicit later extension — they require scoped response scans and are NOT
 *  included merely because the data exists. */
export type DimensionKey = "publisher" | "market" | "language" | "campaign";

export type ManifestValue = { id: string; label: string };
export type ManifestDimension = { key: DimensionKey; label: string; values: ManifestValue[] };
export type DashboardManifest = { dimensions: ManifestDimension[] };

const DIMENSION_LABEL: Record<DimensionKey, string> = {
  publisher: "Publisher",
  market: "Market",
  language: "Delivery Language",
  campaign: "Campaign",
};

// A dimension carries no filtering/comparison power below this many distinct
// values, so it is omitted entirely (no disabled/no-op dropdowns). This is the
// single approved omission rule: 0 values (not present / not entitled) OR 1 value
// (nothing to compare) → omit.
const MIN_COMPARABLE_VALUES = 2;

// Market is a core research dimension users expect to always be able to filter by
// on Discover, so it is surfaced whenever ANY market value exists (even a single
// market — the dropdown then just offers "All markets" + that one market). It is
// still omitted only when the campaigns carry NO market at all (0 values). The
// other dimensions keep the ≥2-distinct-values rule.
const MIN_VALUES_BY_DIMENSION: Partial<Record<DimensionKey, number>> = { market: 1 };
const minValuesFor = (key: DimensionKey): number => MIN_VALUES_BY_DIMENSION[key] ?? MIN_COMPARABLE_VALUES;

function uniqueBy<T>(arr: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const t of arr) {
    const k = key(t);
    if (k && !seen.has(k)) { seen.add(k); out.push(t); }
  }
  return out;
}

/**
 * Build the manifest from an ALREADY-AUTHORISED campaign set. Pure — the caller
 * supplies the campaigns (the authorised/effective universe) and a publisher-name
 * resolver whose domain is only the org ids present in those campaigns.
 * Dimensions with fewer than MIN_COMPARABLE_VALUES distinct values are omitted.
 */
export function buildDashboardManifest(
  campaigns: ScopeCampaign[],
  publisherName: (orgId: string) => string,
): DashboardManifest {
  const publishers: ManifestValue[] = uniqueBy(
    campaigns.map((c) => c.publisher_org_id).filter((x): x is string => !!x),
    (x) => x,
  ).map((id) => ({ id, label: publisherName(id) }));

  const markets: ManifestValue[] = uniqueBy(
    campaigns.map((c) => c.market ?? c.country_code).filter((x): x is string => !!x),
    (x) => x,
  ).map((m) => ({ id: m, label: m }));

  const languages: ManifestValue[] = uniqueBy(
    campaigns.map((c) => c.survey_language).filter((x): x is string => !!x),
    (x) => x,
  ).map((l) => ({ id: l, label: l.toUpperCase() }));

  const nameOf = new Map(campaigns.map((c) => [c.campaign_id, c] as const));
  const campaignValues: ManifestValue[] = uniqueBy(
    campaigns.map((c) => c.campaign_id).filter((x): x is string => !!x),
    (x) => x,
  ).map((slug) => {
    const c = nameOf.get(slug)!;
    const parts = [c.publisher_org_id ? publisherName(c.publisher_org_id) : "", c.market ?? c.country_code ?? ""]
      .map((s) => s.trim()).filter(Boolean);
    return { id: slug, label: parts.length ? parts.join(" · ") : slug };
  });

  const candidate: ManifestDimension[] = [
    { key: "publisher", label: DIMENSION_LABEL.publisher, values: publishers },
    { key: "market", label: DIMENSION_LABEL.market, values: markets },
    { key: "language", label: DIMENSION_LABEL.language, values: languages },
    { key: "campaign", label: DIMENSION_LABEL.campaign, values: campaignValues },
  ];

  return { dimensions: candidate.filter((d) => d.values.length >= minValuesFor(d.key)) };
}

/**
 * Resolve the manifest for an authorised campaign set, resolving Publisher names
 * ONLY for org ids present in those campaigns (leak-safe). Server-only.
 */
export async function resolveDashboardManifest(
  campaigns: ScopeCampaign[],
  opts: { client?: DashboardDb } = {},
): Promise<DashboardManifest> {
  const db = opts.client ?? supabaseAdmin;
  const publisherIds = [...new Set(campaigns.map((c) => c.publisher_org_id).filter((x): x is string => !!x))];
  const orgName = new Map<string, string>();
  if (publisherIds.length) {
    const { data: orgs } = await db.from("organisations").select("id, name").in("id", publisherIds);
    for (const o of orgs ?? []) orgName.set(o.id as string, (o.name as string) || "Publisher");
  }
  return buildDashboardManifest(campaigns, (id) => orgName.get(id) ?? "Publisher");
}

// ── Deliverable 4 — filter validation (fail-closed, manifest-bound) ──────────
// The single reusable validator every later Performance/Results/Campaign route
// calls instead of inventing its own. Untrusted query/filter input is accepted
// ONLY when its dimension is present in the manifest AND its value is one of that
// dimension's authorised values. An unknown dimension (including one OMITTED from
// the manifest, e.g. Publisher for a single-publisher caller) or an out-of-manifest
// value fails closed. Crucially, an arbitrary Publisher id/name is compared to the
// manifest — it is NEVER resolved/looked-up from the client value, so no
// inaccessible organisation name can be disclosed.

export type FilterInput = Record<string, string | null | undefined>;
export type ValidatedFilters = ResultsFilters; // { publisher?, market?, campaign?, language? }
export type FilterRejection = {
  dimension: string;
  value: string;
  reason: "unknown_dimension" | "value_out_of_manifest";
};
export type FilterValidation =
  | { ok: true; filters: ValidatedFilters }
  | { ok: false; filters: ValidatedFilters; rejections: FilterRejection[] };

const INPUT_TO_DIMENSION: Record<string, DimensionKey> = {
  publisher: "publisher",
  market: "market",
  language: "language",
  campaign: "campaign",
};

/**
 * Validate untrusted filter input against the manifest. `ok: false` when ANY
 * supplied filter is unknown or out-of-manifest — the caller MUST then treat the
 * result as empty (fail closed), never silently drop the offending filter (which
 * would broaden results). `filters` carries only the accepted (safe) subset.
 */
export function validateDashboardFilters(manifest: DashboardManifest, input: FilterInput): FilterValidation {
  const byKey = new Map(manifest.dimensions.map((d) => [d.key, new Set(d.values.map((v) => v.id))] as const));
  const filters: ValidatedFilters = {};
  const rejections: FilterRejection[] = [];

  for (const [rawKey, rawVal] of Object.entries(input)) {
    const value = (rawVal ?? "").trim();
    if (!value) continue; // absent filter = no constraint on that dimension

    const dim = INPUT_TO_DIMENSION[rawKey];
    if (!dim) { rejections.push({ dimension: rawKey, value, reason: "unknown_dimension" }); continue; }

    const allowed = byKey.get(dim);
    // A dimension omitted from the manifest (not entitled / not comparable) is
    // treated as unknown — it is not available to this caller.
    if (!allowed) { rejections.push({ dimension: rawKey, value, reason: "unknown_dimension" }); continue; }
    if (!allowed.has(value)) { rejections.push({ dimension: rawKey, value, reason: "value_out_of_manifest" }); continue; }

    filters[dim] = value;
  }

  if (rejections.length) return { ok: false, filters, rejections };
  return { ok: true, filters };
}

/**
 * Narrow an authorised campaign set to the slugs matching VALIDATED filters,
 * reusing the existing survey-results filter engine. Callers pass only the output
 * of validateDashboardFilters (never raw client input) so this is always applied
 * within the authorised universe.
 */
export function effectiveSlugsForFilters(campaigns: ScopeCampaign[], filters: ValidatedFilters): string[] {
  return filterCampaignSlugs(campaigns, filters);
}
