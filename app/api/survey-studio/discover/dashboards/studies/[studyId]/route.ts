// ── Survey Studio → Discover → Dashboards — user Study read/edit/delete ──────
// Manage an organisation-created analysis grouping. Two management authorities:
//   • the OWNING organisation's users (own-org), or
//   • a platform operator holding the Platform-Operator `study`-domain entitlement
//     (cross-org) — NEVER the bare admin role.
// Management authority ≠ data authority. When an operator edits ANOTHER org's Study,
// the eligible/valid survey universe is resolved from the OWNING organisation's
// governed universe (never the operator's broader one) — so an operator can never
// slip a survey the client isn't entitled to into the client's Study. Every submitted
// id is revalidated server-side against a freshly-resolved owner universe and the
// whole write fails closed on any id outside it. DELETE removes only the grouping +
// its membership (cascade) — never surveys, campaigns, responses, answers, events,
// scopes, ORE, entitlements, canonical studies, Reports, Analysis or RP.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser, type AuthedUser } from "@/lib/auth-server";
import {
  resolveDashboardScope, resolveEntitledSurveys, resolveOrgDashboardScope,
  operatorMayManageStudies, type DashboardScope,
} from "@/lib/studio/dashboard-scope";
import { assembleLanding, type LandingSurvey } from "@/lib/studio/dashboard-landing";
import { STUDY_MIN_SURVEYS, STUDY_NAME_MAX } from "@/lib/studio/user-study";

type OwnedStudy = { id: string; name: string; organisationId: string; sameOrg: boolean };

/** Load a user Study the caller may MANAGE: its owning organisation, OR a platform
 *  operator with the study-management entitlement. Else null (404, no leak). */
async function loadManageableStudy(session: AuthedUser, studyId: string): Promise<OwnedStudy | null> {
  const { data } = await supabaseAdmin.from("dashboard_studies").select("id, name, organisation_id").eq("id", studyId).maybeSingle();
  if (!data) return null;
  const owner = (data as { organisation_id?: string | null }).organisation_id ?? null;
  if (!owner) return null;
  const sameOrg = !!session.organisationId && owner === session.organisationId;
  if (!sameOrg && !(await operatorMayManageStudies(session))) return null; // never bare admin role
  return { id: data.id as string, name: (data.name as string) ?? "", organisationId: owner, sameOrg };
}

/** The governed scope of the OWNING organisation (own-org caller → the caller's own
 *  scope; cross-org operator → the owner org's org-level scope). Never the operator's. */
async function ownerScope(session: AuthedUser, study: OwnedStudy): Promise<DashboardScope> {
  return study.sameOrg ? resolveDashboardScope(session) : resolveOrgDashboardScope(study.organisationId);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ studyId: string }> }) {
  const { studyId } = await params;
  let session; try { session = await requireUser(req, ["admin", "brand", "agency", "publisher"]); } catch (err) { return err as Response; }
  const study = await loadManageableStudy(session, studyId);
  if (!study) return NextResponse.json({ error: "Study not found." }, { status: 404 });

  const [{ data: mems }, scope, orgRow] = await Promise.all([
    supabaseAdmin.from("dashboard_study_surveys").select("survey_id").eq("study_id", studyId),
    ownerScope(session, study),
    study.sameOrg ? Promise.resolve(null) : supabaseAdmin.from("organisations").select("id, name").eq("id", study.organisationId).maybeSingle(),
  ]);
  // Eligible surveys = the OWNING organisation's governed universe (picker source).
  const surveys = scope.isEmpty ? [] : await resolveEntitledSurveys(scope);
  const eligibleSurveys: LandingSurvey[] = assembleLanding(surveys, scope.campaigns, new Map(), new Map()).surveys;

  return NextResponse.json({
    id: study.id, name: study.name,
    memberSurveyIds: ((mems ?? []) as { survey_id: string }[]).map((m) => m.survey_id),
    eligibleSurveys,
    ownerOrganisation: study.sameOrg ? null : { id: study.organisationId, name: ((orgRow?.data as { name?: string } | null)?.name) ?? "another organisation" },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ studyId: string }> }) {
  const { studyId } = await params;
  let session; try { session = await requireUser(req, ["admin", "brand", "agency", "publisher"]); } catch (err) { return err as Response; }
  const study = await loadManageableStudy(session, studyId);
  if (!study) return NextResponse.json({ error: "Study not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const wantsName = typeof body?.name === "string";
  const wantsSurveys = Array.isArray(body?.surveyIds);
  if (!wantsName && !wantsSurveys) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  if (wantsName) {
    const name = (body.name as string).trim();
    if (!name) return NextResponse.json({ error: "A study name is required." }, { status: 400 });
    if (name.length > STUDY_NAME_MAX) return NextResponse.json({ error: `Study name must be ${STUDY_NAME_MAX} characters or fewer.` }, { status: 400 });
    const { error } = await supabaseAdmin.from("dashboard_studies").update({ name }).eq("id", studyId);
    if (error) return NextResponse.json({ error: "Could not rename the study." }, { status: 500 });
  }

  if (wantsSurveys) {
    // Freshly resolve the OWNING organisation's universe — an operator's broader
    // access can NEVER contaminate a client's Study.
    const scope = await ownerScope(session, study);
    const ownerIds = new Set(scope.isEmpty ? [] : (await resolveEntitledSurveys(scope)).map((s) => s.id));
    const submitted = [...new Set((body.surveyIds as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()))];
    if (submitted.some((id) => !ownerIds.has(id))) return NextResponse.json({ error: "One or more selected surveys aren't available to this organisation." }, { status: 400 });
    if (submitted.length < STUDY_MIN_SURVEYS) return NextResponse.json({ error: `A study needs at least ${STUDY_MIN_SURVEYS} surveys.` }, { status: 400 });

    const { data: existing } = await supabaseAdmin.from("dashboard_study_surveys").select("survey_id").eq("study_id", studyId);
    // Preserve members outside the current owner universe (can't be seen/managed here) — an edit never destroys a hidden member.
    const preservedHidden = ((existing ?? []) as { survey_id: string }[]).map((m) => m.survey_id).filter((id) => !ownerIds.has(id));
    const next = [...new Set([...submitted, ...preservedHidden])];

    await supabaseAdmin.from("dashboard_study_surveys").delete().eq("study_id", studyId);
    const { error } = await supabaseAdmin.from("dashboard_study_surveys").insert(next.map((surveyId) => ({ study_id: studyId, survey_id: surveyId })));
    if (error) return NextResponse.json({ error: "Could not update the study's surveys." }, { status: 500 });
    if (!wantsName) await supabaseAdmin.from("dashboard_studies").update({ name: study.name }).eq("id", studyId); // touch updated_at
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ studyId: string }> }) {
  const { studyId } = await params;
  let session; try { session = await requireUser(req, ["admin", "brand", "agency", "publisher"]); } catch (err) { return err as Response; }
  const study = await loadManageableStudy(session, studyId);
  if (!study) return NextResponse.json({ error: "Study not found." }, { status: 404 });

  // Deletes ONLY the grouping; membership rows cascade. No research data is touched.
  const { error } = await supabaseAdmin.from("dashboard_studies").delete().eq("id", studyId);
  if (error) return NextResponse.json({ error: "Could not delete the study." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
