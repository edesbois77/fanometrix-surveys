// ── Survey Studio — remove a Survey from a Study ─────────────────────────────
// Admin/operator only. Returns the Survey to standalone (study_id = null). Scoped to
// THIS study (only removes if the survey currently belongs to it), so it can never
// affect a survey in a different study. NEVER touches Survey id / Campaigns /
// Responses / Results / Findings — membership is metadata above the Survey.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { canCurateStudies } from "@/lib/studio/study";
import { canManageSurvey } from "@/lib/studio/collection-health";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; surveyId: string }> }) {
  const { id, surveyId } = await ctx.params;
  let session;
  try { session = await requireUser(req); } catch (err) { return err as Response; }
  if (!canCurateStudies(session)) return NextResponse.json({ error: "Forbidden", code: "study_admin_only" }, { status: 403 });

  const { data: survey } = await supabaseAdmin
    .from("surveys").select("id, organisation_id, study_id").eq("id", surveyId).single();
  if (!survey || !canManageSurvey(session, survey)) return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  if (survey.study_id !== id) return NextResponse.json({ error: "This survey isn't in this study." }, { status: 409 });

  const { error } = await supabaseAdmin
    .from("surveys").update({ study_id: null, updated_at: new Date().toISOString() })
    .eq("id", surveyId).eq("study_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, surveyId, studyId: null });
}
