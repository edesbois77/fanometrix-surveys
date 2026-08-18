// ── Campaign day boundaries in the MARKET's timezone ──────────────────────────
// A Campaign's calendar day is defined by the market/country it runs in (settled
// V1 requirement), NOT the server timezone:
//   • Start becomes active at 00:01 local time in the market's timezone.
//   • End stops collection at 23:59 local time in the market's timezone.
// Deploy is still the activation gate — these boundaries only gate an ALREADY
// deployed Campaign's effective status (Scheduled → Live → Closed).
//
// Timezone resolution REUSES the existing governed mapping lib/reports/timezones
// (country_code → IANA zone, DST-aware via Intl, UTC fallback for unmapped). We do
// not invent a mapping. Multi-timezone markets resolve to that mapping's single
// documented representative zone (e.g. US→America/New_York). IANA zones (not fixed
// offsets) keep the boundary correct across DST.

import { zoneForCountryCode } from "@/lib/reports/timezones";

export { zoneForCountryCode };

/** Offset (ms) between the given zone's wall clock and UTC at `date`. */
function offsetMs(zone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const m: Record<string, number> = {};
  for (const p of dtf.formatToParts(date)) if (p.type !== "literal") m[p.type] = Number(p.value);
  const asUTC = Date.UTC(m.year, m.month - 1, m.day, m.hour % 24, m.minute, m.second);
  return asUTC - date.getTime();
}

/** Convert a wall-clock (YYYY-MM-DD, hh, mm) in an IANA `zone` to the UTC instant.
 *  DST-safe: the offset is measured at the actual instant, with a second pass to
 *  settle transition edges. */
export function zonedWallClockToInstant(dateStr: string, hh: number, mm: number, zone: string): Date {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const naiveUTC = Date.UTC(y, mo - 1, d, hh, mm, 0);
  const off1 = offsetMs(zone, new Date(naiveUTC));
  let ts = naiveUTC - off1;
  const off2 = offsetMs(zone, new Date(ts));
  if (off2 !== off1) ts = naiveUTC - off2;
  return new Date(ts);
}

/** Instant at which a Campaign's start boundary (00:01 local, market timezone)
 *  occurs. */
export function campaignStartInstant(startDate: string, countryCode: string | null | undefined): Date {
  return zonedWallClockToInstant(startDate, 0, 1, zoneForCountryCode(countryCode));
}

/** Instant at which a Campaign's end boundary (23:59 local, market timezone)
 *  occurs. */
export function campaignEndInstant(endDate: string, countryCode: string | null | undefined): Date {
  return zonedWallClockToInstant(endDate, 23, 59, zoneForCountryCode(countryCode));
}

/** The current calendar date (YYYY-MM-DD) in a market's timezone. Used as the
 *  atomic guard threshold for Return-to-Draft: a Scheduled campaign may only revert
 *  while its start_date is STRICTLY after the market-local today (i.e. it has not
 *  reached its start day), which the DB can compare against the start_date column at
 *  commit — no RPC needed. */
export function marketLocalDate(countryCode: string | null | undefined, now: Date = new Date()): string {
  const dtf = new Intl.DateTimeFormat("en-CA", { timeZone: zoneForCountryCode(countryCode), year: "numeric", month: "2-digit", day: "2-digit" });
  return dtf.format(now); // en-CA renders YYYY-MM-DD
}

/**
 * The stored status a deliberate Deploy should set, decided SERVER-side (never the
 * client): "live" if the campaign's market-local start boundary has already
 * arrived, otherwise "scheduled" (deployed-but-waiting; the lazy effective-status
 * engine flips it to live at the market-local start — no cron). A missing start is
 * treated as immediate (defensive; Deploy requires a start).
 */
export function resolveDeployTargetStatus(
  startDate: string | null | undefined,
  countryCode: string | null | undefined,
  now: Date = new Date(),
): "live" | "scheduled" {
  if (!startDate) return "live";
  return campaignStartInstant(startDate, countryCode) <= now ? "live" : "scheduled";
}
