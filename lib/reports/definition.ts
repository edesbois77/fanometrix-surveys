// Loading a partner report's definition. The registry is the database, not
// code: issuing the next partner report is an INSERT into partner_reports, not
// a deploy. See supabase-migration-138.sql.

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { PartnerReport } from "./types";

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
    campaignIds: row.campaign_ids ?? [],
    dataFrom: row.data_from,
    status: row.status,
    logoUrl: row.logo_url,
    version: row.version ?? 1,
  };
}

/** Resolve /reports/<org>/<report>. Returns null for an unknown or archived
 *  report — the route renders the same "not found" either way, so a wrong slug
 *  cannot be used to discover which partners have reports. */
export async function getPartnerReport(
  orgSlug: string,
  reportSlug: string,
): Promise<PartnerReport | null> {
  const { data, error } = await supabaseAdmin
    .from("partner_reports")
    .select(
      "id, org_slug, report_slug, organisation_id, organisation_name, brand_name, report_title, campaign_title, research_question, campaign_ids, data_from, status, logo_url, version",
    )
    .eq("org_slug", orgSlug)
    .eq("report_slug", reportSlug)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as Row;
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
  const { data, error } = await supabaseAdmin
    .from("partner_reports")
    .select(
      "id, org_slug, report_slug, organisation_id, organisation_name, brand_name, report_title, campaign_title, research_question, campaign_ids, data_from, status, logo_url, version",
    )
    .eq("id", reportId)
    .maybeSingle();
  if (error || !data) return null;
  return toReport(data as Row);
}
