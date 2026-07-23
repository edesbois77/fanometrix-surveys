// Country → IANA timezone, for expressing engagement in the audience's own
// local time rather than UTC.
//
// A "peak hour" quoted in UTC is not an insight a media planner can use: it has
// to be the hour the fan was actually holding the phone. Converting with a real
// timezone (rather than a fixed offset) keeps the answer correct across a DST
// boundary, which a campaign running into late October will cross.
//
// Countries not listed fall back to UTC, which is correct-by-default rather
// than silently wrong: the report labels the axis with the zone it used.

import { COUNTRIES } from "@/lib/countries";

const ZONES: Record<string, string> = {
  GB: "Europe/London",
  IE: "Europe/Dublin",
  PT: "Europe/Lisbon",
  FR: "Europe/Paris",
  ES: "Europe/Madrid",
  IT: "Europe/Rome",
  DE: "Europe/Berlin",
  NL: "Europe/Amsterdam",
  BE: "Europe/Brussels",
  SE: "Europe/Stockholm",
  PL: "Europe/Warsaw",
  IN: "Asia/Kolkata",
  US: "America/New_York",
  BR: "America/Sao_Paulo",
  NG: "Africa/Lagos",
  EG: "Africa/Cairo",
  ID: "Asia/Jakarta",
  TH: "Asia/Bangkok",
  VN: "Asia/Ho_Chi_Minh",
  MY: "Asia/Kuala_Lumpur",
  AU: "Australia/Sydney",
};

export function zoneForCountryCode(code: string | null | undefined): string {
  if (!code) return "UTC";
  return ZONES[code.toUpperCase()] ?? "UTC";
}

export function zoneForCountryName(name: string | null | undefined): string {
  if (!name) return "UTC";
  const match = COUNTRIES.find((c) => c.name.toLowerCase() === name.toLowerCase());
  return match ? zoneForCountryCode(match.code) : "UTC";
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** The local hour (0–23) of an instant, in the given zone. */
export function localHour(iso: string, zone: string): number {
  let fmt = formatters.get(zone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: zone });
    formatters.set(zone, fmt);
  }
  // "24" is how en-GB renders midnight under hour12:false in some runtimes.
  const hour = Number(fmt.format(new Date(iso)));
  return Number.isFinite(hour) ? hour % 24 : 0;
}
