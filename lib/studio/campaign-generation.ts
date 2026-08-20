// ── Survey Studio → Create → Campaigns: pure generation / reconciliation core ──
// Deterministic, side-effect-free. The API layer owns auth, org scoping, DB reads
// and writes; this module only decides WHICH campaigns should exist for a Survey
// and how an existing set reconciles to that desired set.
//
// Canonical deployment unit (Product Authority, settled):
//   Survey × Publisher × Market × required Delivery Language.
// Normally one Campaign per market; a market with multiple governed required
// delivery languages fans out to one Campaign per language. Markets that share a
// language stay separate Campaigns (they reuse the same Survey translation).
//
// The governed market→language relationship is the SAME source the About/Survey
// stages use (lib/locales.ts). This module never invents a mapping.

import { countryByCode } from "@/lib/countries";
import { expectedSurveyLanguage } from "@/lib/locales";

/** A distribution Publisher: the Current Organisation (self-service) or a selected
 *  distribution Publisher (commissioned). */
export interface StudioPublisher {
  orgId: string;
  name: string;
}

/** ONE explicit distribution choice: this Publisher WILL distribute in this market.
 *  The distribution plan is a set of these, NOT a Publisher×Market cartesian — a
 *  Publisher may be selected for only a subset of the Survey's markets. */
export interface DistributionSelection {
  publisherOrgId: string;
  publisherName: string;
  countryCode: string;
}

export interface GenerationInput {
  surveyId: string;
  surveyName: string;
  /** The explicit distribution plan: exactly the (Publisher, market) pairs chosen.
   *  Each pair fans out to one Campaign per governed required delivery language. */
  selections: DistributionSelection[];
  /** Snapshot copied onto each Campaign at generation (surveys.creative_design). */
  creativeDesign: string | null;
  /** Inherited context, null for standalone self-service Studio surveys. */
  brandOrgId: string | null;
  agencyOrgId: string | null;
}

/** The natural key reconciliation matches on. A surviving line keeps its slug and
 *  its user-entered target / mode / schedule. */
export interface CampaignKey {
  publisherOrgId: string;
  countryCode: string;
  surveyLanguage: string;
}

export interface DesiredCampaign extends CampaignKey {
  /** Immutable, deterministic embed slug (campaigns.campaign_id). */
  slug: string;
  /** Display market name (campaigns.market). */
  market: string;
  publisherName: string;
  /** Generated, cosmetic (campaigns.campaign_name). */
  campaignName: string;
  surveyId: string;
  creativeDesign: string | null;
  brandOrgId: string | null;
  agencyOrgId: string | null;
}

/**
 * Governed delivery language(s) for one market. One today (one language per
 * country via lib/locales COUNTRY_TO_LANGUAGE). Returns a LIST so that if the
 * governed relationship ever yields multiple required languages for a market,
 * this fans out to one Campaign per language with no caller change.
 */
export function governedLanguagesForMarket(countryCode: string): string[] {
  return [expectedSurveyLanguage(countryCode)];
}

/** Stable 8-hex id fragment for slug building. */
function hex8(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toLowerCase();
}

/** Deterministic, immutable, slug-safe embed id for a Campaign line. Stable across
 *  reconciliations because it derives only from immutable inputs, so a surviving
 *  line never churns its attribution key. */
export function buildSlug(surveyId: string, publisherOrgId: string, countryCode: string, lang: string): string {
  const l = lang.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `studio_${hex8(surveyId)}_${hex8(publisherOrgId)}_${countryCode.toLowerCase()}_${l}`;
}

/** Studio-generated slugs share this prefix. Retained because it is how a slug is
 *  BUILT (see buildCampaignSlug above) and how historical slugs read.
 *
 *  It is no longer how a Studio campaign is IDENTIFIED — use `campaigns.origin`
 *  and the helper below. Two reasons the prefix was the wrong test:
 *
 *   • In SQL LIKE, `_` is a single-character wildcard, so the pattern
 *     'studio_%' also matches 'studioX...'. Every call site had to remember to
 *     escape it, and none of them did. Provenance now lives in a column with a
 *     CHECK constraint instead of in a string convention.
 *   • A slug is user-visible and a campaign's origin is not something a rename
 *     should be able to change. Migration 208 makes origin immutable in practice
 *     by pinning it at creation and guarding campaign identity with a trigger. */
export const STUDIO_SLUG_PREFIX = "studio_";

/** Generated, cosmetic Campaign name in the settled format:
 *  "Survey Name • Publisher • Country". Delivery language is shown separately on the
 *  campaign (governed by market), so it is not part of the name. No em-dashes. */
export function buildCampaignName(surveyName: string, publisherName: string, market: string): string {
  const name = surveyName.trim() || "Untitled survey";
  return `${name} • ${publisherName} • ${market}`;
}

export function keyOf(k: CampaignKey): string {
  return `${k.publisherOrgId}::${k.countryCode}::${k.surveyLanguage}`;
}

/** The exact set of Campaigns that SHOULD exist for the chosen distribution plan.
 *  Deterministic and order-stable. Each explicit (Publisher, market) selection fans
 *  out to one Campaign per governed required delivery language; a Publisher chosen
 *  for only some markets yields Campaigns only for those markets. */
export function buildDesiredCampaigns(input: GenerationInput): DesiredCampaign[] {
  const out: DesiredCampaign[] = [];
  const seen = new Set<string>();
  for (const sel of input.selections) {
    const country = countryByCode(sel.countryCode);
    if (!country) continue; // unknown market code — ignore rather than fabricate
    for (const lang of governedLanguagesForMarket(sel.countryCode)) {
      const k: CampaignKey = { publisherOrgId: sel.publisherOrgId, countryCode: sel.countryCode, surveyLanguage: lang };
      const dedupe = keyOf(k);
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({
        ...k,
        slug: buildSlug(input.surveyId, sel.publisherOrgId, sel.countryCode, lang),
        market: country.name,
        publisherName: sel.publisherName,
        campaignName: buildCampaignName(input.surveyName, sel.publisherName, country.name),
        surveyId: input.surveyId,
        creativeDesign: input.creativeDesign,
        brandOrgId: input.brandOrgId,
        agencyOrgId: input.agencyOrgId,
      });
    }
  }
  return out;
}

// ── Target allocation (bulk) ───────────────────────────────────────────────────

/**
 * Divide an overall total across `n` Campaigns so the per-Campaign targets sum
 * EXACTLY to `total`. Deterministic: the base amount goes to every Campaign and
 * the remainder is spread one-per-Campaign across the first `remainder` of them.
 * e.g. allocateTarget(1000, 4) → [250,250,250,250]; allocateTarget(1001, 3) →
 * [334,334,333]. This does NOT create an authoritative Publisher/overall target —
 * the per-Campaign values remain the only authoritative targets (their sum is the
 * displayed overall).
 */
export function allocateTarget(total: number, n: number): number[] {
  if (n <= 0) return [];
  if (!Number.isFinite(total) || total <= 0) return Array(n).fill(0);
  const whole = Math.floor(total);
  const base = Math.floor(whole / n);
  const remainder = whole - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

export interface ExistingCampaign {
  slug: string;
}

export interface ReconcilePlan {
  /** Desired lines with NO row at all (active or tombstoned) — INSERT as Draft. */
  toCreate: DesiredCampaign[];
  /** Desired lines whose deterministic slug already exists as a SOFT-REMOVED row —
   *  UNDELETE and reset to a fresh Draft. Because slugs are deterministic and
   *  campaigns.campaign_id is UNIQUE, a removed Publisher×Market×Language leaves a
   *  tombstone that still owns the slug; re-selecting that market must revive that
   *  row, NEVER insert a duplicate (which would violate the unique constraint). */
  toRestore: DesiredCampaign[];
  /** Slugs of existing active Draft lines that remain — preserve their edits. */
  toKeep: string[];
  /** Slugs of existing active Draft lines no longer desired — soft-remove (safe:
   *  Draft, pre-collection). */
  toRemove: string[];
}

/** Idempotent reconciliation against BOTH the active and the soft-removed
 *  (tombstoned) Studio campaigns. A desired slug is: kept if active, restored if a
 *  tombstone exists, else created. Active lines no longer desired are removed. Same
 *  inputs → same plan; a removed line that is re-desired restores its own row
 *  exactly once (deterministic identity, no duplicate slug). */
export function reconcile(
  desired: DesiredCampaign[],
  existingActive: ExistingCampaign[],
  existingDeleted: ExistingCampaign[] = [],
): ReconcilePlan {
  const desiredSlugs = new Set(desired.map((d) => d.slug));
  const activeSlugs = new Set(existingActive.map((e) => e.slug));
  const deletedSlugs = new Set(existingDeleted.map((e) => e.slug));
  return {
    toCreate: desired.filter((d) => !activeSlugs.has(d.slug) && !deletedSlugs.has(d.slug)),
    toRestore: desired.filter((d) => !activeSlugs.has(d.slug) && deletedSlugs.has(d.slug)),
    toKeep: desired.filter((d) => activeSlugs.has(d.slug)).map((d) => d.slug),
    toRemove: existingActive.filter((e) => !desiredSlugs.has(e.slug)).map((e) => e.slug),
  };
}

// ── Config validation (Deploy-readiness) ──────────────────────────────────────

export interface CampaignConfig {
  target_responses: number | null;
  target_mode: string | null; // "continue" | "stop"
  start_date: string | null;  // ISO date (YYYY-MM-DD) or null = "when I deploy"
  end_date: string | null;    // ISO date or null = "manual"
}

/** Validate a single Campaign's editable config against the settled rules.
 *  Returns a list of human-readable problems ([] = valid). Pure.
 *
 *  Start date is REQUIRED: a Campaign always carries an explicit configured start.
 *  A past start simply means "activate on deploy"; a future start means the
 *  Campaign enters Scheduled/Waiting once deployed. Deploy (not this date) is the
 *  activation gate, so a past start is NOT invalid. End is optional and, when set,
 *  must be on or after the start. */
export function validateCampaignConfig(c: CampaignConfig): string[] {
  const problems: string[] = [];
  if (c.target_responses != null) {
    if (!Number.isInteger(c.target_responses) || c.target_responses <= 0) {
      problems.push("Response target must be a positive whole number.");
    }
  }
  if (c.target_mode === "stop" && c.target_responses == null) {
    problems.push("Stop collecting needs a response target to stop at.");
  }
  if (!c.start_date) {
    problems.push("Start date is required.");
  }
  if (c.start_date && c.end_date && c.end_date < c.start_date) {
    problems.push("End date must be on or after the start date.");
  }
  return problems;
}

/** Deploy unlocks only when at least one Campaign exists and every Campaign's
 *  config is valid. */
export function campaignsReadyForDeploy(configs: CampaignConfig[]): boolean {
  if (configs.length === 0) return false;
  return configs.every((c) => validateCampaignConfig(c).length === 0);
}
