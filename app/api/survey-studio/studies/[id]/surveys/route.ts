// ── Survey Studio — Study membership (add existing Survey + eligible list) ────
// Admin/operator only. Adding a Survey sets surveys.study_id — it NEVER touches the
// Survey id, its Campaigns, Responses, Results or Findings. Only STANDALONE, real,
// non-deleted Surveys the curator operationally manages are eligible; a Survey
// already in another Study is excluded (no silent move).
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { canCurateStudies, isEligibleToAdd } from "@/lib/studio/study";
import { canManageSurvey } from "@/lib/studio/collection-health";

async function loadStudy(id: string) {
  const { data } = await supabaseAdmin.from("studies").select("id").eq("id", id).single();
  return data;
}

// Eligible standalone Surveys for the "Add existing" picker.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let session;
  try { session = await requireUser(req); } catch (err) { return err as Response; }
  if (!canCurateStudies(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await loadStudy(id))) return NextResponse.json({ error: "Study not found" }, { status: 404 });

  // Standalone (study_id null), real, non-deleted. Admin manages all; the operational
  // ownership check is applied per row (admins pass; a future non-admin curator would
  // only see their own org's surveys — fail-closed).
  const { data } = await supabaseAdmin
    .from("surveys").select("id, name, status, organisation_id, study_id, is_simulated")
    .is("study_id", null).is("deleted_at", null).neq("status", "deleted")
    .order("created_at", { ascending: false });
  const eligible = (data ?? [])
    .filter((s) => canManageSurvey(session, s) && isEligibleToAdd(s))
    .map((s) => ({ id: s.id, name: s.name, status: s.status }));
  return NextResponse.json({ surveys: eligible });
}

// Add an existing Survey to the Study.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let session;
  try { session = await requireUser(req); } catch (err) { return err as Response; }
  if (!canCurateStudies(session)) return NextResponse.json({ error: "Forbidden", code: "study_admin_only" }, { status: 403 });
  if (!(await loadStudy(id))) return NextResponse.json({ error: "Study not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const surveyId = typeof body?.surveyId === "string" ? body.surveyId : "";
  if (!surveyId) return NextResponse.json({ error: "A survey is required." }, { status: 400 });

  const { data: survey } = await supabaseAdmin
    .from("surveys").select("id, name, status, organisation_id, study_id, is_simulated").eq("id", surveyId).is("deleted_at", null).single();
  if (!survey || !canManageSurvey(session, survey)) return NextResponse.json({ error: "Survey not found" }, { status: 404 }); // existence-preserving / cross-org fail-closed
  if (survey.study_id) {
    return NextResponse.json({ error: survey.study_id === id ? "This survey is already in this study." : "This survey belongs to another study. Remove it there first (moving is a deliberate action).", code: "already_in_study" }, { status: 409 });
  }
  if (!isEligibleToAdd(survey)) return NextResponse.json({ error: "This survey can't be added.", code: "ineligible" }, { status: 409 });

  // Atomic add — only claim a STANDALONE survey (study_id still null), so a concurrent
  // add can't move it out from under this one. NEVER touches id/campaigns/responses.
  const { data, error } = await supabaseAdmin
    .from("surveys").update({ study_id: id, updated_at: new Date().toISOString() })
    .eq("id", surveyId).is("study_id", null).select("id, study_id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "This survey was assigned to a study elsewhere. Reload.", code: "already_in_study" }, { status: 409 });
  return NextResponse.json({ ok: true, surveyId, studyId: id });
}
