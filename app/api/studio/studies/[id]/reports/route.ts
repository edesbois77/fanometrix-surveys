// ── Manage → Study → Reports: list + readiness (GET) · generate (POST) ───────
// Study-MANAGE scoped (canCurateStudies via the service). Composes a DRAFT report from
// the Study's approved Findings — never re-analyses. The client sends only a title +
// selected finding ids + an optional editorial brief; the server builds the governed
// input, composes, verifies, and persists.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/auth-server";
import { generateReport, listReports, reportReadinessFor } from "@/lib/studio/report/report-service";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let session: AuthedUser;
  try { session = await requireUser(req); } catch { return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }
  // ?readiness=1 → the deterministic gate; otherwise the report list.
  if (new URL(req.url).searchParams.get("readiness")) {
    const r = await reportReadinessFor(session, id);
    if (r.access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (r.access !== "ok") return NextResponse.json({ error: "Study not found" }, { status: 404 });
    return NextResponse.json({ readiness: r.readiness });
  }
  const res = await listReports(session, id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res.data);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let session: AuthedUser;
  try { session = await requireUser(req); } catch { return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }
  const body = await req.json().catch(() => ({}));
  const res = await generateReport(session, id, {
    title: typeof body.title === "string" ? body.title : undefined,
    selectedFindingIds: Array.isArray(body.selectedFindingIds) ? body.selectedFindingIds.filter((x: unknown) => typeof x === "string") : undefined,
    editorialBrief: typeof body.editorialBrief === "string" ? body.editorialBrief : null,
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res.data, { status: 201 });
}
