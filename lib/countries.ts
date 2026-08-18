/**
 * Static country list for Research Project deployment generation.
 * No admin CRUD requirement was requested for this list (unlike Publishers),
 * so it lives in code rather than a DB-backed registry table.
 */

export type Country = { code: string; name: string };

// Order matters: this is the display order of the Market chips. The leading block
// is the priority market order; the remainder follows.
export const COUNTRIES: Country[] = [
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" },
  { code: "US", name: "United States" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "NL", name: "Netherlands" },
  { code: "SE", name: "Sweden" },
  { code: "PL", name: "Poland" },
  { code: "AR", name: "Argentina" },
  { code: "CA", name: "Canada" },
  // Remaining markets
  { code: "IN", name: "India" },
  { code: "PT", name: "Portugal" },
  { code: "BE", name: "Belgium" },
  { code: "NG", name: "Nigeria" },
  { code: "EG", name: "Egypt" },
  { code: "ID", name: "Indonesia" },
  { code: "TH", name: "Thailand" },
  { code: "VN", name: "Vietnam" },
  { code: "MY", name: "Malaysia" },
  { code: "AU", name: "Australia" },
];

export function countryByCode(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code);
}

export function countryOptions(): { value: string; label: string }[] {
  return COUNTRIES
    .map((c) => ({ value: c.code, label: c.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
