// /reports/fedex/ucl-sponsorship — the FedEx UEFA Champions League Sponsorship
// report. A thin route over the Fanometrix Report framework: it resolves the
// unlock cookie, then renders either the password gate or the report shell fed
// by ./content. All presentation lives in the framework; all content in the
// config. Issuing the next report is a new folder like this one — not new
// framework code.
//
// This page must never be indexed. Metadata sets the full robots directive set;
// middleware already adds X-Robots-Tag to everything under /reports and
// robots.txt disallows /reports; the report is in no sitemap. Nothing about the
// findings reaches the browser until the password is answered.

import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { HeroSection } from "@/lib/reports/framework/types";
import { isUnlocked, reportCookieName } from "@/lib/reports/framework/access";
import { getViewCount } from "@/lib/reports/framework/views";
import { ReportShell } from "@/app/reports/components/framework/ReportShell";
import { PasswordGate } from "@/app/reports/components/framework/PasswordGate";
import { fedexUclReport } from "./content";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_INDEX: Metadata["robots"] = {
  index: false,
  follow: false,
  nocache: true,
  noarchive: true,
  nosnippet: true,
  noimageindex: true,
  googleBot: { index: false, follow: false, noarchive: true, nosnippet: true, noimageindex: true },
};

export const metadata: Metadata = {
  // Stays generic until the reader is past the gate — a leaked link reveals
  // nothing about the client or the findings.
  title: `${fedexUclReport.documentTitle} · Fanometrix`,
  description: "Confidential research report.",
  robots: NO_INDEX,
  // Suppress rich unfurls: a shared link shows a bare, uninformative card.
  openGraph: {
    title: "Confidential report · Fanometrix",
    description: "This report is confidential and password protected.",
  },
  twitter: { card: "summary", title: "Confidential report · Fanometrix" },
};

export default async function FedexUclReportPage() {
  const report = fedexUclReport;
  const jar = await cookies();
  const unlocked = await isUnlocked(jar.get(reportCookieName(report.access.id))?.value, report.access.id);

  const hero = report.sections.find((s): s is HeroSection => s.type === "hero");
  const heroPreparedFor = hero?.meta.preparedFor;

  if (!unlocked) {
    return (
      <PasswordGate reportId={report.access.id} title={report.documentTitle} preparedFor={heroPreparedFor} />
    );
  }

  const views = await getViewCount(report.access.id, report.access.viewSeed ?? 0);

  return <ReportShell config={report} views={views} />;
}
