// Records that a report was opened.
//
// A POST rather than a side effect of rendering the page, for two reasons: a
// server component cannot set a cookie during render, and a GET that writes is
// a GET that a prefetch, a link checker or a retry will fire again. This runs
// once per page load, from the browser, after the reader is past the password.
//
// Gated by the same unlock cookie as the report. Without it this is a 404: no
// one should be able to inflate, or even discover, another partner's engagement
// with their report.

import { NextRequest, NextResponse } from "next/server";
import { getPartnerReport } from "@/lib/reports/definition";
import { isUnlocked, reportCookieName } from "@/lib/reports/access";
import { READER_COOKIE, READER_COOKIE_OPTIONS, recordVisit } from "@/lib/reports/visits";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ org: string; report: string }> },
) {
  const { org, report } = await params;
  const definition = await getPartnerReport(org, report);
  if (!definition) return new NextResponse(null, { status: 404 });

  if (!(await isUnlocked(req.cookies.get(reportCookieName(definition.id))?.value, definition.id))) {
    return new NextResponse(null, { status: 404 });
  }

  // A returning browser keeps its identifier, so it stays one reader; a new one
  // gets a random id that says nothing about who they are.
  const existing = req.cookies.get(READER_COOKIE)?.value;
  const visitorId = existing && existing.length <= 64 ? existing : crypto.randomUUID();

  await recordVisit(definition.id, visitorId);

  const res = new NextResponse(null, { status: 204 });
  if (!existing) res.cookies.set(READER_COOKIE, visitorId, READER_COOKIE_OPTIONS);
  return res;
}
