/**
 * Standardised naming convention helpers for Surveys, Campaigns, Campaign Groups,
 * and Research Projects. All four share one Name Builder pattern — Topic, Brand,
 * Agency, Type — so they share one naming function:
 *
 * Campaign Group / Survey / Research Project:  [Topic] | [Type] | [Brand] | [Agency]
 * Campaign:                                    [Topic] | [Type] | [Brand] | [Agency] | [Country] | [Publisher]
 *
 * Brand and Agency are optional and only appear when set — Topic and Type are
 * the only two required inputs. Campaigns extend the shared name with Country
 * and Publisher so Generate Deployments can still produce a uniquely-named
 * campaign per country × publisher combination.
 *
 * Slug rules: lowercase, spaces→underscores, strip special chars, max 80 chars.
 */

export function toSlugPart(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

// ── Shared: Campaign Group / Survey / Research Project ─────────────────────────

export function generateStudyName(topic: string, studyType: string, brand?: string, agency?: string): string {
  const t = topic.trim();
  const ty = studyType.trim();
  if (!t || !ty) return "";
  return [t, ty, brand?.trim(), agency?.trim()].filter(Boolean).join(" | ");
}

export function generateStudySlug(topic: string, studyType: string, brand?: string, agency?: string): string {
  const t = toSlugPart(topic);
  const ty = toSlugPart(studyType);
  if (!t || !ty) return "";
  const b = brand ? toSlugPart(brand) : "";
  const a = agency ? toSlugPart(agency) : "";
  return [t, ty, b, a].filter(Boolean).join("_").slice(0, 80);
}

// ── Campaign — extends the shared name with Country + Publisher ────────────────

export function generateCampaignName(
  topic: string,
  studyType: string,
  brand: string,
  agency: string,
  country: string,
  publisher: string
): string {
  const base = generateStudyName(topic, studyType, brand, agency);
  if (!base) return "";
  return [base, country.trim(), publisher.trim()].filter(Boolean).join(" | ");
}

export function generateCampaignSlug(
  topic: string,
  studyType: string,
  brand: string,
  agency: string,
  country: string,
  publisher: string
): string {
  const base = generateStudySlug(topic, studyType, brand, agency);
  if (!base) return "";
  const c = country ? toSlugPart(country) : "";
  const p = publisher ? toSlugPart(publisher) : "";
  return [base, c, p].filter(Boolean).join("_").slice(0, 80);
}

// ── Study types — shared Type dropdown across all four ─────────────────────────

export const STUDY_TYPES = [
  "fan_understanding",
  "brand_health",
  "sponsorship",
  "rules_regulations",
  "event_tournament",
  "product_research",
  "media_consumption",
  "purchase_intent",
  "attitudes_behaviours",
  "creative_testing",
  "audience_profiling",
  "custom",
] as const;

export type StudyType = (typeof STUDY_TYPES)[number];

export const STUDY_TYPE_LABELS: Record<StudyType, string> = {
  fan_understanding: "Fan Understanding",
  brand_health: "Brand Health",
  sponsorship: "Sponsorship",
  rules_regulations: "Rules & Regulations",
  event_tournament: "Event/Tournament",
  product_research: "Product Research",
  media_consumption: "Media Consumption",
  purchase_intent: "Purchase Intent",
  attitudes_behaviours: "Attitudes & Behaviours",
  creative_testing: "Creative Testing",
  audience_profiling: "Audience Profiling",
  custom: "Custom",
};

export function studyTypeLabel(studyType: string): string {
  return STUDY_TYPE_LABELS[studyType as StudyType] ?? studyType;
}
