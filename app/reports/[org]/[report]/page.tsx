// /reports/<org>/<report> — a partner's Audience Intelligence Report.
//
// The route is generic. Everything specific to a partner, a brand or a campaign
// comes from the partner_reports row the two slugs resolve to, so issuing the
// next report is an INSERT rather than a deploy.
//
// This page must never be indexed. The metadata below sets the full set of
// robots directives, middleware adds an X-Robots-Tag header (which covers the
// CSV downloads too, where meta tags cannot reach), and /reports is disallowed
// in robots.txt. It appears in no sitemap.

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getPartnerReport } from "@/lib/reports/definition";
import { isUnlocked, reportCookieName } from "@/lib/reports/access";
import { buildAudienceIntelligenceReport } from "@/lib/reports/engine";
import { ReportDocument } from "@/app/reports/components/ReportDocument";
import { PasswordGate } from "./PasswordGate";
import { ReportStyles } from "./ReportStyles";

// Always computed fresh: the report states a "data through" time, so a cached
// copy would be quietly lying about how current it is.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_INDEX: Metadata["robots"] = {
  index: false,
  follow: false,
  nocache: true,
  noarchive: true,
  nosnippet: true,
  noimageindex: true,
  googleBot: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
    noimageindex: true,
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ org: string; report: string }>;
}): Promise<Metadata> {
  const { org, report } = await params;
  const definition = await getPartnerReport(org, report);
  return {
    // The title is intentionally generic until the reader is past the gate.
    title: definition ? `${definition.reportTitle} · Fanometrix` : "Fanometrix",
    robots: NO_INDEX,
  };
}

export default async function PartnerReportPage({
  params,
}: {
  params: Promise<{ org: string; report: string }>;
}) {
  const { org, report } = await params;
  const definition = await getPartnerReport(org, report);
  if (!definition) notFound();

  const jar = await cookies();
  const unlocked = await isUnlocked(jar.get(reportCookieName(definition.id))?.value, definition.id);

  if (!unlocked) {
    // Nothing about the campaign, the brand or the figures reaches the browser
    // until the password is answered — the gate is rendered instead of the
    // report, not on top of it.
    return (
      <>
        <ReportStyles />
        <PasswordGate
          orgSlug={definition.orgSlug}
          reportSlug={definition.reportSlug}
          organisationName={definition.organisationName}
          reportTitle={definition.reportTitle}
        />
      </>
    );
  }

  const model = await buildAudienceIntelligenceReport(definition);

  return (
    <>
      <ReportStyles />
      <ReportDocument model={model} />
    </>
  );
}
