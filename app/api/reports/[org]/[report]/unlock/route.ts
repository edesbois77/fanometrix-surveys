// Answering a report's password challenge.
//
// Returns the same generic message whether the report does not exist or the
// password is wrong, so the endpoint cannot be used to discover which partners
// have reports. A small fixed delay on failure blunts online guessing without
// needing state.

import { NextRequest, NextResponse } from "next/server";
import { getPartnerReport, getReportPasswordHash } from "@/lib/reports/definition";
import {
  UNLOCK_COOKIE_OPTIONS,
  mintUnlockToken,
  reportCookieName,
  verifyReportPassword,
} from "@/lib/reports/access";

const GENERIC_FAILURE = "That password did not match. Please check the details you were sent.";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ org: string; report: string }> },
) {
  const { org, report } = await params;

  let password = "";
  try {
    const body = (await req.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: GENERIC_FAILURE }, { status: 400 });
  }

  const fail = async () => {
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: GENERIC_FAILURE }, { status: 401 });
  };

  const definition = await getPartnerReport(org, report);
  if (!definition) return fail();

  const hash = await getReportPasswordHash(definition.id);
  if (!hash) return fail();

  const ok = await verifyReportPassword(password, hash);
  if (!ok) return fail();

  const token = await mintUnlockToken(definition.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(reportCookieName(definition.id), token, UNLOCK_COOKIE_OPTIONS);
  return res;
}
