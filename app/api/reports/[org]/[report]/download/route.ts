// The report's CSV exports.
//
// Gated by the same per-report unlock cookie as the page: a download link is
// exactly as shareable as the report it belongs to, and no more. Without the
// cookie this is a 404, not a 401 — an unauthenticated caller learns nothing
// about whether the report exists.

import { NextRequest, NextResponse } from "next/server";
import { getPartnerReport } from "@/lib/reports/definition";
import { isUnlocked, reportCookieName } from "@/lib/reports/access";
import { buildMetricsCsv, buildResponsesCsv, exportFilename } from "@/lib/reports/csv";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ org: string; report: string }> },
) {
  const { org, report } = await params;
  const definition = await getPartnerReport(org, report);
  if (!definition) return new NextResponse("Not found", { status: 404 });

  const token = req.cookies.get(reportCookieName(definition.id))?.value;
  if (!(await isUnlocked(token, definition.id))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const type = req.nextUrl.searchParams.get("type");
  if (type !== "responses" && type !== "metrics") {
    return new NextResponse("Unknown export type", { status: 400 });
  }

  let csv: string;
  try {
    csv = type === "responses" ? await buildResponsesCsv(definition) : await buildMetricsCsv(definition);
  } catch (err) {
    // A partial CSV is worse than none: it looks complete and quietly drops
    // rows. Fail the download instead, and keep the reason in the server log.
    console.error("[reports] export failed", type, err instanceof Error ? err.message : err);
    return new NextResponse("This export could not be generated. Please try again.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const filename = exportFilename(definition, type === "responses" ? "responses" : "hourly-metrics", "csv");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Meta robots tags cannot reach a CSV; the header can.
      "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
      "Cache-Control": "no-store",
    },
  });
}
