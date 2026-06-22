/**
 * Standardised naming convention helpers for Surveys, Campaigns, Campaign Groups.
 *
 * Survey:         [Brand] - [Research Theme] - v[N]
 * Campaign:       [Brand] | [Research Theme] | [Country] | [Publisher] | [Year]
 * Campaign Group: [Brand] | [Research Theme] | Global | [Year]
 *
 * Slug rules: lowercase, spaces→underscores, strip special chars, max 80 chars.
 */

function toSlugPart(s: string): string {
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
