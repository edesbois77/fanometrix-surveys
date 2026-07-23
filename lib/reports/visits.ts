// How much a report has actually been read.
//
// Counted per report, from a random identifier held in an httpOnly cookie. That
// identifies a browser, not a person, and this module never pretends otherwise:
// the type says `uniqueReaders`, the cover says "readers", and the methodology
// spells out the difference. A report that overstated its own readership would
// be a strange thing to put in a document about measuring an audience honestly.
//
// Every function here degrades to null rather than throwing. The counter is the
// least important thing on the page, and a report must never fail to render
// because its visit table is missing or its analytics query timed out.

import { supabaseAdmin } from "@/lib/supabase-admin";

export type VisitCounts = {
  /** Distinct browsers that have opened this report. */
  uniqueReaders: number;
  /** Times it has been opened, including repeat visits. */
  totalVisits: number;
};

/** The cookie is shared across every report a reader opens, so the same browser
 *  is one reader everywhere rather than a new one per link. Uniqueness is
 *  always computed per report by the query, not by the cookie. */
export const READER_COOKIE = "fmx_reader";

export const READER_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

export async function recordVisit(reportId: string, visitorId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("partner_report_visits")
    .insert({ report_id: reportId, visitor_id: visitorId });
  if (error) {
    // Including a missing table: this ships before its migration is applied,
    // and a report that cannot count its readers is still a working report.
    console.error("[reports] visit not recorded:", error.message);
  }
}

/** Both totals for a report, or null when they cannot be read.
 *
 *  Null is rendered as no counter at all rather than as a zero. "0 readers" on
 *  a report someone is currently reading is worse than saying nothing. */
export async function getVisitCounts(reportId: string): Promise<VisitCounts | null> {
  const { data, error } = await supabaseAdmin
    .from("partner_report_visits")
    .select("visitor_id")
    .eq("report_id", reportId);

  if (error || !data) return null;

  const rows = data as { visitor_id: string }[];
  if (rows.length === 0) return null;

  return {
    uniqueReaders: new Set(rows.map((r) => r.visitor_id)).size,
    totalVisits: rows.length,
  };
}
