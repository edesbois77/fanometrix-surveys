// How many times a framework report has been opened.
//
// Same shape as lib/reports/visits.ts (a row per visit, browser identified by an
// httpOnly cookie), but keyed by the report's string id rather than a
// partner_reports uuid, and displayed as a SEED + real visits. The seed exists
// so a just-published report doesn't read "0 views" — it is added to, never
// instead of, the real count, so the figure only ever grows truthfully.
//
// Every function degrades to the seed (or null) rather than throwing: the
// counter is the least important thing on the page and must never stop a report
// from rendering because its table is missing or a query timed out.

import { supabaseAdmin } from "@/lib/supabase-admin";

const TABLE = "framework_report_views";

/** The cookie is shared with the partner reports so the same browser is one
 *  reader across everything Fanometrix publishes. */
export { READER_COOKIE, READER_COOKIE_OPTIONS } from "@/lib/reports/visits";

export async function recordView(reportId: string, visitorId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from(TABLE)
    .insert({ report_id: reportId, visitor_id: visitorId });
  if (error) {
    // Includes a missing table: this ships before its migration is applied, and
    // a report that cannot count its readers is still a working report.
    console.error("[reports/framework] view not recorded:", error.message);
  }
}

/** Total displayed views = seed + real recorded visits.
 *
 *  Returns the seed alone when the table can't be read (so the panel still shows
 *  a believable figure), and null only when there is nothing to show at all. */
export async function getViewCount(reportId: string, seed = 0): Promise<number | null> {
  const { count, error } = await supabaseAdmin
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("report_id", reportId);

  if (error) return seed > 0 ? seed : null;
  return seed + (count ?? 0);
}
