/**
 * Standardised naming convention helpers for Surveys, Campaigns, Campaign Groups,
 * and Research Projects.
 *
 * Survey:           [Brand] - [Research Theme] - v[N]
 * Campaign:         [Brand] | [Research Theme] | [Country] | [Publisher] | [Year]
 * Campaign Group:   [Brand] | [Research Theme] | Global | [Year]
 * Research Project: [Brand or Topic] | [Study Type] | [Year]
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

// ── Survey ────────────────────────────────────────────────────────────────────

export function generateSurveyName(brand: string, theme: string, version: number): string {
  const b = brand.trim();
  const t = theme.trim();
  if (!b || !t) return "";
  return `${b} - ${t} - v${version}`;
}

export function generateSurveySlug(brand: string, theme: string, version: number): string {
  const b = toSlugPart(brand);
  const t = toSlugPart(theme);
  if (!b || !t) return "";
  return `${b}_${t}_v${version}`.slice(0, 80);
}

// ── Campaign ──────────────────────────────────────────────────────────────────

export function generateCampaignName(
  brand: string,
  theme: string,
  country: string,
  publisher: string,
  year: string
): string {
  const parts = [brand, theme, country, publisher, year]
    .map(s => s.trim())
    .filter(Boolean);
  if (parts.length < 2) return "";
  return parts.join(" | ");
}

export function generateCampaignSlug(
  brand: string,
  theme: string,
  country: string,
  publisher: string,
  year: string
): string {
  const parts = [brand, theme, country, publisher, year]
    .map(toSlugPart)
    .filter(Boolean);
  if (parts.length < 2) return "";
  return parts.join("_").slice(0, 80);
}

// ── Campaign Group ────────────────────────────────────────────────────────────

export function generateGroupName(brand: string, theme: string, year: string): string {
  const b = brand.trim();
  const t = theme.trim();
  const y = year.trim();
  if (!b || !t) return "";
  return [b, t, "Global", y].filter(Boolean).join(" | ");
}

export function generateGroupSlug(brand: string, theme: string, year: string): string {
  const b = toSlugPart(brand);
  const t = toSlugPart(theme);
  const y = toSlugPart(year);
  if (!b || !t) return "";
  return [b, t, "global", y].filter(Boolean).join("_").slice(0, 60);
}

// ── Research Project ──────────────────────────────────────────────────────────

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

/** Project display uses Brand when present, falling back to Topic. */
export function generateProjectName(brandOrTopic: string, studyType: string, year: string): string {
  const b = brandOrTopic.trim();
  const t = studyType.trim();
  const y = year.trim();
  if (!b || !t) return "";
  return [b, t, y].filter(Boolean).join(" | ");
}

export function generateProjectSlug(brandOrTopic: string, studyType: string, year: string): string {
  const b = toSlugPart(brandOrTopic);
  const t = toSlugPart(studyType);
  const y = toSlugPart(year);
  if (!b || !t) return "";
  return [b, t, y].filter(Boolean).join("_").slice(0, 80);
}
