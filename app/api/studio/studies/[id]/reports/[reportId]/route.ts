// ── Manage → Study → Report (GET one) — returns the renderable ReportConfig ──
import { NextRequest, NextResponse } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/auth-server";
import { getReport } from "@/lib/studio/report/report-service";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; reportId: string }> }) {
  const { id, reportId } = await ctx.params;
  let session: AuthedUser;
  try { session = await requireUser(req); } catch { return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }
  const res = await getReport(session, id, reportId);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res.data);
}
