// The embed preview state machine, as pure decisions.
//
// Extracted so the rules that matter are testable without a DOM: which context
// an embed is in, whether a survey component may mount yet, and whether this
// impression is allowed to record evidence.
//
// The defect these encode: the survey path seeded hard-coded sample questions as
// initial state, so ClassicSurvey mounted immediately and was replaced once the
// real creative resolved (the flash) — and when the API refused access, that
// sample survey simply stayed on screen for an unauthorised viewer.

export type PreviewPhase = "loading" | "resolved" | "unavailable" | "error";

export type EmbedContext = {
  hasCampaignSlug: boolean;
  hasGroupSlug: boolean;
  hasSurveyId: boolean;
  previewFlag: boolean;
  hasPreviewToken: boolean;
};

/** Creative Lab / design-card preview: no campaign, group or survey. The ONLY
 *  context permitted to render sample questions. */
export function isDesignSample(c: EmbedContext): boolean {
  return !c.hasGroupSlug && !c.hasSurveyId && !c.hasCampaignSlug;
}

/** Any context whose content is authorisation-gated. A failure here must reveal
 *  nothing: no questions, no intro, no branding, no sample content. */
export function isPreviewContext(c: EmbedContext): boolean {
  return !isDesignSample(c) && (c.previewFlag || c.hasPreviewToken || c.hasSurveyId);
}

/** Genuine live delivery — the only context that records evidence. Derived from
 *  what the embed IS, not from one flag: an ad-ops review link carries a token
 *  WITHOUT preview=1, and would otherwise have written real evidence against a
 *  real campaign. */
export function isProductionDelivery(c: EmbedContext): boolean {
  return (c.hasCampaignSlug || c.hasGroupSlug) && !c.previewFlag && !c.hasPreviewToken;
}

/** Evidence switch: impressions, events, partial answers, completions and
 *  submission logs are all suppressed unless this is production delivery. */
export function suppressEvidence(c: EmbedContext): boolean {
  return !isProductionDelivery(c);
}

/** Nothing may render survey content until the payload AND its creative are
 *  resolved. The design sample has nothing to fetch, so it starts resolved. */
export function initialPhase(c: EmbedContext): PreviewPhase {
  return isDesignSample(c) ? "resolved" : "loading";
}

/** Classify a failed resolution. 401/403/404 — including an invalid, expired,
 *  revoked, malformed or mismatched grant, which the API answers with 404 — are
 *  "unavailable". Anything else, including a network failure (null), is "error".
 *  Neither renders survey content. */
export function phaseForFailure(status: number | null): PreviewPhase {
  return status !== null && (status === 401 || status === 403 || status === 404)
    ? "unavailable"
    : "error";
}

/** The single gate every renderer sits behind. */
export function mayMountSurvey(phase: PreviewPhase): boolean {
  return phase === "resolved";
}
