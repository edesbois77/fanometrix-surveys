// Records that a framework report was opened.
//
// A POST from the browser, once past the password (a GET that writes would be
// re-fired by prefetches and link checkers, and a server component can't set the
// reader cookie during render). Gated by the same unlock cookie as the page:
// without it this is a 404, so no one can inflate — or even probe — a report's
// view count without holding its password.

import { NextRequest, NextResponse } from "next/server";
import { getReportConfig } from "@/lib/reports/framework/reports";
import { isUnlocked, reportCookieName } from "@/lib/reports/framework/access";
import { recordView, READER_COOKIE, READER_COOKIE_OPTIONS } from "@/lib/reports/framework/views";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const config = getReportConfig(id);
  if (!config) return new NextResponse(null, { status: 404 });

  if (!(await isUnlocked(req.cookies.get(reportCookieName(config.access.id))?.value, config.access.id))) {
    return new NextResponse(null, { status: 404 });
  }

  const existing = req.cookies.get(READER_COOKIE)?.value;
  const visitorId = existing && existing.length <= 64 ? existing : crypto.randomUUID();

  await recordView(config.access.id, visitorId);

  const res = new NextResponse(null, { status: 204 });
  if (!existing) res.cookies.set(READER_COOKIE, visitorId, READER_COOKIE_OPTIONS);
  return res;
}
