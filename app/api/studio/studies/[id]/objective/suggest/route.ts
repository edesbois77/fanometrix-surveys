// ── Manage → Study → Objective: AI drafting assistance (admin/operator) ──────
// Suggests ONE research objective from the user's informal intent. Drafting only —
// this never persists; the analyst approves the wording, which is saved via the
// existing study PATCH. Client sends only free-text intent (+ an optional prior draft
// to steer "Try another").
import { NextRequest, NextResponse } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/auth-server";
import { suggestObjective } from "@/lib/studio/study-objective-service";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let session: AuthedUser;
  try { session = await requireUser(req); } catch { return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }

  const body = await req.json().catch(() => ({}));
  const res = await suggestObjective(session, id, body?.intent, body?.avoid);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ objective: res.objective });
}
