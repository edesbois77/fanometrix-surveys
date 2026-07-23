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

import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getPartnerReport } from "@/lib/reports/definition";
import type { PartnerReport } from "@/lib/reports/types";
import { isUnlocked, reportCookieName } from "@/lib/reports/access";
import { buildAudienceIntelligenceReport } from "@/lib/reports/engine";
import { ReportDocument } from "@/app/reports/components/ReportDocument";
import { PasswordGate } from "./PasswordGate";
import { ReportShell } from "./ReportStates";
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
    // The title stays generic until the reader is past the gate.
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

  // Resolved before this component returns any JSX, and therefore before a
  // single byte of the response is committed. A route-level loading.tsx would
  // read better here but costs the status code: it opens a streaming boundary
  // immediately, the 200 goes out, and every wrong link then answers "fine"
  // to caches, link checkers and monitoring. The lookup is one indexed row, so
  // waiting for it is cheap; the expensive part streams below.
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

  return (
    <>
      <ReportStyles />
      <Suspense
        fallback={
          <ReportShell title="Preparing your report" spinner>
            Every figure is being calculated from live campaign data. This takes a moment.
          </ReportShell>
        }
      >
        <ReportBody definition={definition} />
      </Suspense>
    </>
  );
}

/** The whole report, behind the Suspense boundary. Building it reads several
 *  million events, so it is the part worth streaming; everything above it
 *  resolves in a single query. */
async function ReportBody({ definition }: { definition: PartnerReport }) {
  const model = await buildAudienceIntelligenceReport(definition);
  return <ReportDocument model={model} />;
}
