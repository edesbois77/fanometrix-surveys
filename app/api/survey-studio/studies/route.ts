// ── Survey Studio — Studies (create + list) ──────────────────────────────────
// A Study is a Studio-native research container grouping 1..N Surveys. Curation is
// admin/operator ONLY (canCurateStudies) — NOT inferred from any entitlement,
// attribution or distribution. A Study may be created empty (Draft) and receive
// Surveys later. Totals are batched (studies → surveys → vw_survey_stats), no N+1.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { canCurateStudies, validateStudyName, studyCard, type StudyRow } from "@/lib/studio/study";

export async function GET(req: NextRequest) {
  let session;
  try { session = await requireUser(req); } catch (err) { return err as Response; }
  if (!canCurateStudies(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: studies } = await supabaseAdmin.from("studies").select("*").order("created_at", { ascending: false });
  const rows = (studies ?? []) as StudyRow[];
  if (!rows.length) return NextResponse.json({ studies: [] });

  // Batched totals: surveys per study + completed responses per survey (vw_survey_stats).
  const { data: surveyRows } = await supabaseAdmin
    .from("surveys").select("id, study_id").in("study_id", rows.map((s) => s.id)).is("deleted_at", null);
  const surveys = surveyRows ?? [];
  const { data: statRows } = surveys.length
    ? await supabaseAdmin.from("vw_survey_stats").select("id, response_count").in("id", surveys.map((s) => s.id as string))
    : { data: [] as { id: string; response_count: number }[] };
  const respBySurvey = new Map((statRows ?? []).map((s) => [s.id as string, Number(s.response_count ?? 0) || 0]));

  const totals = new Map<string, { surveyCount: number; completedResponses: number }>();
  for (const sv of surveys) {
    const sid = sv.study_id as string;
    const t = totals.get(sid) ?? { surveyCount: 0, completedResponses: 0 };
    t.surveyCount += 1;
    t.completedResponses += respBySurvey.get(sv.id as string) ?? 0;
    totals.set(sid, t);
  }

  return NextResponse.json({ studies: rows.map((r) => studyCard(r, totals.get(r.id) ?? { surveyCount: 0, completedResponses: 0 })) });
}

export async function POST(req: NextRequest) {
  let session;
  try { session = await requireUser(req); } catch (err) { return err as Response; }
  if (!canCurateStudies(session)) return NextResponse.json({ error: "Forbidden", code: "study_admin_only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const invalid = validateStudyName(body?.name);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const commissioningOrgId = typeof body?.commissioningOrganisationId === "string" && body.commissioningOrganisationId ? body.commissioningOrganisationId : null;
  // Attribution-only reference must resolve to a real organisation, if supplied.
  if (commissioningOrgId) {
    const { data: org } = await supabaseAdmin.from("organisations").select("id").eq("id", commissioningOrgId).is("deleted_at", null).single();
    if (!org) return NextResponse.json({ error: "Invalid commissioning organisation." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from("studies").insert({
    name: String(body.name).trim(),
    objective: typeof body?.objective === "string" && body.objective.trim() ? body.objective.trim() : null,
    commissioning_organisation_id: commissioningOrgId,
    status: "draft",
    created_by: session.workEmail,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ study: data }, { status: 201 });
}
