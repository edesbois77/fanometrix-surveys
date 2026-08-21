// ── What we RECORD about a serve, and where each field came from ─────────────
// The embed URL carries ?publisher=, ?market= and ?country=. Those are written
// by whoever assembled the ad tag. They are useful for routing and worthless as
// evidence: nothing verifies that a tag claiming publisher=FotMob was served on
// FotMob, and a mistyped or copied tag misattributes silently.
//
// So the two are kept apart, permanently and by type:
//
//   RoutingClaims       what the caller said. Used to pick a campaign. Never
//                       written to survey_events, response_answers or
//                       responses as a fact about the impression.
//   ResolvedAttribution what the SERVER established by reading the chosen
//                       campaign row: the campaign's configured
//                       publisher_org_id and its configured market/country.
//                       This is what is persisted and what Results may report.
//
// Where the two disagree, the disagreement is itself worth surfacing (an ad tag
// pointing at the wrong publisher is an ad-ops defect), so mismatches are
// reported rather than reconciled.

import type { CampaignFacts, RoutingContext } from "./eligibility";

/** Verbatim, unverified. Kept as a distinct type so it cannot be assigned to
 *  a ResolvedAttribution parameter by accident. */
export interface RoutingClaims {
  readonly claimedPublisher: string | null;
  readonly claimedMarket: string | null;
  readonly claimedCountry: string | null;
}

/** Server-established. Every field is read from the campaign row. */
export interface ResolvedAttribution {
  readonly campaignId: string;
  readonly campaignSlug: string;
  readonly configurationRevisionId: string;
  readonly surveyId: string | null;
  /** The campaign's CONFIGURED publisher organisation. Null means the campaign
   *  is publisher-agnostic — which is a real state, not missing data. */
  readonly publisherOrgId: string | null;
  readonly market: string | null;
  readonly countryCode: string | null;
}

export function routingClaims(ctx: RoutingContext): RoutingClaims {
  return {
    claimedPublisher: ctx.publisher,
    claimedMarket: ctx.market,
    claimedCountry: ctx.country,
  };
}

export function resolveAttribution(
  facts: CampaignFacts,
  configurationRevisionId: string,
): ResolvedAttribution {
  return {
    campaignId: facts.id,
    campaignSlug: facts.slug,
    configurationRevisionId,
    surveyId: facts.surveyId,
    publisherOrgId: facts.publisherOrgId,
    market: facts.market,
    countryCode: facts.countryCode,
  };
}

export type AttributionMismatch = "publisher" | "market" | "country";

/**
 * Fields where the caller's claim contradicts the campaign's configuration.
 *
 * A claim of null is not a contradiction — an omitted parameter is a wildcard,
 * consistent with routing. Likewise a campaign configured as publisher-agnostic
 * contradicts nothing.
 */
export function attributionMismatches(
  claims: RoutingClaims,
  resolved: ResolvedAttribution,
  resolvedPublisherName: string | null,
): AttributionMismatch[] {
  const out: AttributionMismatch[] = [];
  if (claims.claimedPublisher && resolvedPublisherName &&
      claims.claimedPublisher.toLowerCase() !== resolvedPublisherName.toLowerCase()) {
    out.push("publisher");
  }
  if (claims.claimedMarket && resolved.market &&
      claims.claimedMarket.trim().toLowerCase() !== resolved.market.trim().toLowerCase()) {
    out.push("market");
  }
  if (claims.claimedCountry && resolved.countryCode &&
      claims.claimedCountry.toUpperCase() !== resolved.countryCode.toUpperCase()) {
    out.push("country");
  }
  return out;
}

/**
 * The columns migration 213 added to survey_events / response_answers /
 * responses. Only server-resolved values appear here — there is deliberately no
 * field into which a routing claim could be written.
 */
export function evidenceColumns(resolved: ResolvedAttribution): {
  campaign_id: string;
  survey_id: string | null;
  configuration_revision_id: string;
} {
  return {
    campaign_id: resolved.campaignSlug,
    survey_id: resolved.surveyId,
    configuration_revision_id: resolved.configurationRevisionId,
  };
}
