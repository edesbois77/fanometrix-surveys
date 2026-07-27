// Unlock a framework report.
//
// Verifies the attempt against the report's configured env password hash and, on
// success, sets the short-lived per-report unlock cookie the page checks. Lives
// under /api/reports, which middleware exempts from the platform session gate —
// the recipient is an external stakeholder, not a Fanometrix user — so this
// route's own password check IS the gate.

import { NextRequest, NextResponse } from "next/server";
import { getReportConfig } from "@/lib/reports/framework/reports";
import {
  verifyReportConfigPassword,
  mintUnlockToken,
  reportCookieName,
  UNLOCK_COOKIE_OPTIONS,
} from "@/lib/reports/framework/access";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const config = getReportConfig(id);
  if (!config) return new NextResponse(null, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";

  const ok = await verifyReportConfigPassword(config, password);
  if (!ok) {
    return NextResponse.json(
      { error: "That password did not match. Please check the details you were sent." },
      { status: 401 },
    );
  }

  const token = await mintUnlockToken(config.access.id);
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(reportCookieName(config.access.id), token, UNLOCK_COOKIE_OPTIONS);
  return res;
}
