// ── Manage → Study → Finding: detail + edit/publish (admin/operator) ─────────
// GET returns the Finding + its ordered, frozen evidence (faithful render, no
// recompute). PATCH edits prose (headline/commentary) or publishes. Publish never
// re-resolves Results or alters evidence. No entitlement/Report/Discover side effect.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/auth-server";
import { getFinding, editFinding, publishFinding } from "@/lib/studio/study-finding-service";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; findingId: string }> }) {
  const { id, findingId } = await ctx.params;
  let session: AuthedUser;
  try { session = await requireUser(req); } catch { return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }
  const res = await getFinding(session, id, findingId);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res.data);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; findingId: string }> }) {
  const { id, findingId } = await ctx.params;
  let session: AuthedUser;
  try { session = await requireUser(req); } catch { return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }

  const body = await req.json().catch(() => ({}));
  const res = body?.action === "publish"
    ? await publishFinding(session, id, findingId)
    : body?.action === "edit"
      ? await editFinding(session, id, findingId, { headline: body?.headline, commentary: body?.commentary })
      : null;
  if (!res) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res.data);
}
