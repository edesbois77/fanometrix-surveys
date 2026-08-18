// ── Survey Studio Create — Purpose taxonomy & commercial guardrail ───────────
// The "who is this research for / why" model behind the About → Purpose field.
// It is framed around FIRST-PARTY vs THIRD-PARTY, NOT "does the subject have
// commercial value": a Publisher researching its OWN business (subscriptions,
// advertising audience, strategy, performance) is first-party and permitted,
// even though it is commercial. Only research conducted FOR/ON BEHALF OF an
// external party (advertiser, sponsor, agency, client, other) routes to Request.
//
// This module is the single source of truth for the Purpose FIELD (options + the
// "first-party vs third-party" classification). It contains NO authorisation/role
// logic: whether a given user MAY use the third-party purpose is a governed Q-10
// capability decision, consumed via lib/survey-create-capability.ts and passed in
// here as an already-resolved boolean. Its authoritative definition/policy belongs
// in the governed catalogue (lib/authz/product-access.ts) via Organisations
// governance — not here. The UI is not the security boundary; the server enforces
// the resolved capability in app/api/surveys/[id].

export type PurposeValue =
  | "editorial_audience"
  | "product_experience"
  | "first_party_business"
  | "third_party";

export interface PurposeOption {
  value: PurposeValue;
  /** Human, "who it's for / why" — never an internal taxonomy value. */
  label: string;
  help: string;
  firstParty: boolean;
}

export const PURPOSE_OPTIONS: PurposeOption[] = [
  {
    value: "editorial_audience",
    label: "To understand our editorial or audience",
    help: "What our readers think, want or respond to.",
    firstParty: true,
  },
  {
    value: "product_experience",
    label: "To improve our own product or experience",
    help: "How people use what we make, and how to make it better.",
    firstParty: true,
  },
  {
    value: "first_party_business",
    label: "To inform our own business",
    help: "Our subscriptions, advertising audience, strategy or performance.",
    firstParty: true,
  },
  {
    value: "third_party",
    label: "For an advertiser, sponsor, client or agency",
    help: "Research run on behalf of another company. This is handled through Request.",
    firstParty: false,
  },
];

const OPTION_BY_VALUE = new Map(PURPOSE_OPTIONS.map((o) => [o.value, o]));

export function isPurposeValue(v: unknown): v is PurposeValue {
  return typeof v === "string" && OPTION_BY_VALUE.has(v as PurposeValue);
}

/** A third-party purpose is one that is NOT first-party (i.e. run for an external
 *  party). Unknown/blank values are treated as not-third-party (a blank draft is
 *  fine). */
export function isThirdPartyPurpose(v: unknown): boolean {
  if (!isPurposeValue(v)) return false;
  return OPTION_BY_VALUE.get(v)?.firstParty === false;
}

/**
 * The Publisher commercial-purpose rule for Create, given the ALREADY-RESOLVED
 * governed capability. This function is pure classification + rule; it performs
 * NO authorisation itself.
 *   • `canUseCommissionedPurposes` — the resolved governed Q-10 capability
 *     (consumed via canCreateCommissionedResearch()); when the user holds it
 *     (Fanometrix's broader Create, once governance grants it), any purpose is allowed.
 *   • Otherwise (Publisher self-service Create) only a FIRST-PARTY purpose may
 *     proceed; a third-party purpose belongs in Request.
 *   • A blank/unset purpose is always allowed (drafts start empty).
 *
 * The same call backs the UI projection and the authoritative server refusal, so
 * they cannot diverge.
 */
export function purposeAllowedForCreate(canUseCommissionedPurposes: boolean, purpose: unknown): boolean {
  if (canUseCommissionedPurposes) return true;
  if (purpose == null || purpose === "") return true;
  return !isThirdPartyPurpose(purpose);
}

/**
 * Whether Brand/Agency ATTRIBUTION applies to a survey. True only when the Purpose
 * is the commissioned (third-party) option AND the author may actually use it here
 * (`canUseCommissioned`) — i.e. the survey persists a commissioned purpose in Create
 * rather than routing to Request. Drives both the About-stage Brand/Agency section
 * visibility and whether those attribution fields are persisted, so the two can
 * never diverge.
 *
 * ATTRIBUTION IS NOT ACCESS: this only governs whether the (optional) brand_org_id/
 * agency_org_id are shown and saved. It never affects ownership, permissions or
 * visibility — see the server enforcement in app/api/surveys/[id].
 */
export function showsCommissionedAttribution(purpose: unknown, canUseCommissioned: boolean): boolean {
  return canUseCommissioned && isThirdPartyPurpose(purpose);
}
