// ── Manage → Study → Results: cross-Survey evidence (read-only) ──────────────
// STUDY-MANAGE scoped (canCurateStudies — admin/operator), NOT data entitlement.
// All maths delegate to the trusted Survey Results engine via resolveStudyResults;
// this route only shapes the response. No raw respondent data is ever returned.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/auth-server";
import { resolveStudyResults } from "@/lib/studio/study-results-resolve";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let session: AuthedUser;
  try { session = await requireUser(req); } catch { return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }

  const { access, results } = await resolveStudyResults(session, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (access === "not_found" || !results) return NextResponse.json({ error: "Study not found" }, { status: 404 });

  return NextResponse.json(results);
}
