// Loading a partner report's definition. The registry is the database, not
// code: issuing the next partner report is an INSERT into partner_reports, not
// a deploy. See supabase-migration-138.sql.

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { PartnerReport } from "./types";
import type { ReportAudience } from "./narrative";

type Row = {
  id: string;
  org_slug: string;
  report_slug: string;
  organisation_id: string | null;
  organisation_name: string;
  brand_name: string;
  report_title: string;
  campaign_title: string;
  research_question: string | null;
  campaign_ids: string[];
  data_from: string | null;
  status: PartnerReport["status"];
  logo_url: string | null;
  version: number;
  audience?: ReportAudience;
  subtitle?: string | null;
};

function toReport(row: Row): PartnerReport {
  return {
    id: row.id,
    orgSlug: row.org_slug,
    reportSlug: row.report_slug,
    organisationId: row.organisation_id,
    organisationName: row.organisation_name,
    brandName: row.brand_name,
    reportTitle: row.report_title,
    campaignTitle: row.campaign_title,
    researchQuestion: row.research_question,
    subtitle: row.subtitle ?? null,
    campaignIds: row.campaign_ids ?? [],
    dataFrom: row.data_from,
    status: row.status,
    logoUrl: row.logo_url,
    version: row.version ?? 1,
    audience: row.audience ?? "publisher",
  };
}

const CORE_COLUMNS =
  "id, org_slug, report_slug, organisation_id, organisation_name, brand_name, report_title, campaign_title, research_question, campaign_ids, data_from, status, logo_url, version";

/** Columns added after the table shipped. Selected when present and defaulted
 *  when not.
 *
 *  Code and schema do not land at the same instant: a deploy can precede its
 *  migration, or a migration can be applied to one environment before another.
 *  Naming a not-yet-added column in the select turns that ordinary skew into a
 *  hard failure, and because the route treats a query error as "no such report"
 *  the symptom is a 404 on a report that plainly exists. Asking for the newer
 *  columns separately means the worst case is a report that renders with its
 *  defaults. */
const OPTIONAL_COLUMNS = "audience, subtitle";

async function selectReport(
  match: (q: ReturnType<typeof baseQuery>) => ReturnType<typeof baseQuery>,
): Promise<Row | null> {
  const withOptional = await match(baseQuery(`${CORE_COLUMNS}, ${OPTIONAL_COLUMNS}`)).maybeSingle();
  if (!withOptional.error) return (withOptional.data as unknown as Row) ?? null;

  const core = await match(baseQuery(CORE_COLUMNS)).maybeSingle();
  if (core.error || !core.data) return null;
  return core.data as unknown as Row;
}

function baseQuery(columns: string) {
  return supabaseAdmin.from("partner_reports").select(columns);
}

/** Resolve /reports/<org>/<report>. Returns null for an unknown or archived
 *  report — the route renders the same "not found" either way, so a wrong slug
 *  cannot be used to discover which partners have reports. */
export async function getPartnerReport(
  orgSlug: string,
  reportSlug: string,
): Promise<PartnerReport | null> {
  const row = await selectReport((q) => q.eq("org_slug", orgSlug).eq("report_slug", reportSlug));
  if (!row) return null;
  if (row.status === "archived") return null;
  return toReport(row);
}

/** The password hash, fetched separately so it never travels with the data the
 *  page renders. */
export async function getReportPasswordHash(reportId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("partner_reports")
    .select("password_hash")
    .eq("id", reportId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { password_hash: string }).password_hash;
}

export async function getPartnerReportById(reportId: string): Promise<PartnerReport | null> {
  const row = await selectReport((q) => q.eq("id", reportId));
  return row ? toReport(row) : null;
}
