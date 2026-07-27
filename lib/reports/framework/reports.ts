// The published-report registry.
//
// Maps a report id (the stable string in ReportConfig.access.id) to its config.
// The API routes (unlock, view) resolve a report from its id here, exactly as
// the partner routes resolve a report from its slugs via getPartnerReport — so
// no route hard-codes a single report. A new report is one line in REPORTS.
//
// Content lives beside its route (app/reports/<slug>/content.ts) so authoring a
// report keeps the data next to the page that renders it; this registry just
// gathers them for the id-keyed server lookups.

import type { ReportConfig } from "./types";
import { fedexUclReport } from "@/app/reports/fedex/ucl-sponsorship/content";

const REPORTS: ReportConfig[] = [fedexUclReport];

const BY_ID = new Map(REPORTS.map((r) => [r.access.id, r]));

export function getReportConfig(id: string): ReportConfig | null {
  return BY_ID.get(id) ?? null;
}
