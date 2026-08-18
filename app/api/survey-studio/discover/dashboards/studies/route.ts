// ── Survey Studio → Discover → Dashboards — user Study create (write) ────────
// Creates an ORGANISATION-owned analysis grouping over surveys the caller is
// ALREADY authorised to see. NEVER an entitlement operation:
//   • Every submitted survey id is revalidated server-side against the caller's
//     governed authorised universe (resolveAuthorisedSurveyIds) — a hand-crafted
//     id outside it fails the whole request closed.
//   • The grouping is owned by the caller's organisation; it writes only
//     dashboard_studies + dashboard_study_surveys and touches no survey/campaign/
//     canonical-study relationship.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { resolveAuthorisedSurveyIds } from "@/lib/studio/dashboard-scope";
import { validateStudyDraft } from "@/lib/studio/user-study";

export async function POST(req: NextRequest) {
  let session;
  try { session = await requireUser(req, ["admin", "brand", "agency", "publisher"]); }
  catch (err) { return err as Response; }

  if (!session.organisationId) {
    return NextResponse.json({ error: "An organisation context is required to create a study." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const authorisedSurveyIds = await resolveAuthorisedSurveyIds(session);
  const draft = validateStudyDraft(body?.name, body?.surveyIds, authorisedSurveyIds);
  if (!draft.ok) return NextResponse.json({ error: draft.error }, { status: 400 });

  const { data: created, error: createErr } = await supabaseAdmin
    .from("dashboard_studies")
    .insert({ organisation_id: session.organisationId, name: draft.name, created_by: session.id })
    .select("id")
    .single();
  if (createErr || !created) return NextResponse.json({ error: "Could not create the study." }, { status: 500 });

  const studyId = created.id as string;
  const { error: memErr } = await supabaseAdmin
    .from("dashboard_study_surveys")
    .insert(draft.surveyIds.map((surveyId) => ({ study_id: studyId, survey_id: surveyId })));
  if (memErr) {
    // Roll back the (now membership-less) study so we never leave a broken grouping.
    await supabaseAdmin.from("dashboard_studies").delete().eq("id", studyId);
    return NextResponse.json({ error: "Could not save the study's surveys." }, { status: 500 });
  }

  return NextResponse.json({ studyId }, { status: 201 });
}
