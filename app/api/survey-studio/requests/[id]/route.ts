import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { requestVisibleTo, isDirectlyPatchableStatus } from "@/lib/research-request";

// ── Survey Studio — a single Request (view + review) ─────────────────────────
// GET   → the full brief. Current-Organisation scoped (admins see all).
// PATCH → a minimal review transition (accept / needs_clarification / decline).
//         Review is a Fanometrix action, so status changes are admin-only in V1.
//         This is intake review, NOT a large operational review system; the
//         accepted→Create hand-off lives in ./create-survey.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser(req);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const { data, error } = await supabaseAdmin.from("research_requests").select("*").eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: "Request not found." }, { status: 404 });

  if (!requestVisibleTo(data, session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    // Reviewing (accept / clarify / decline) is a Fanometrix action.
    session = await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const nextStatus = body?.status;

  // Only accept / decline may be set directly here. 'needs_clarification' is
  // DELIBERATELY excluded: it must go through POST …/clarify (which emails the
  // requester first), so there is exactly ONE way to reach that state — a
  // clarification is never recorded without someone actually being contacted.
  // 'submitted' is the immutable initial state and can never be set via PATCH.
  if (!isDirectlyPatchableStatus(nextStatus)) {
    const code = nextStatus === "needs_clarification" ? "needs_clarification_requires_message" : "invalid_status";
    const error = nextStatus === "needs_clarification"
      ? "Requesting clarification must go through the clarification workflow (POST …/clarify)."
      : "Invalid status transition.";
    return NextResponse.json({ error, code }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin.from("research_requests").select("id").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "Request not found." }, { status: 404 });

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("research_requests")
    .update({ status: nextStatus, reviewed_at: now, reviewed_by: session.workEmail, updated_at: now })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
