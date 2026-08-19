import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { nullifyBlankUuids, brandAgencyRefError, type OrgRefRow } from "@/lib/survey-validation";
import { grantSurveyDataEntitlement } from "@/lib/studio/data-entitlement";
import { governSurveyQuestions } from "@/lib/studio/scale-templates";
import { ANALYSIS_MIN_BASE, surveyAnalysisEligibility } from "@/lib/studio/survey-analysis-evidence";

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireUser(req);
  } catch (err) {
    return err as Response;
  }

  let query = supabaseAdmin.from("surveys").select("*").order("created_at", { ascending: false });

  // Non-admins only ever see surveys created by someone at their own
  // organisation — never another organisation's, never an admin-authored
  // one (organisation_id IS NULL for those). Dashboard/reporting data is
  // unaffected since it's scoped by campaign visibility, not this.
  if (session.role !== "admin") {
    if (!session.organisationId) return NextResponse.json({ data: [] });
    query = query.eq("organisation_id", session.organisationId);
  }

  const [{ data: surveys, error }, { data: stats }, { data: analysisRuns }] = await Promise.all([
    query,
    supabaseAdmin.from("vw_survey_stats").select("*"),
    // Which surveys have a completed analysis (for the Manage list's contextual
    // action: Analyse vs Regenerate/View findings). One batched read, additive.
    supabaseAdmin.from("survey_analysis_runs").select("survey_id").eq("status", "completed"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const statsMap = new Map(
    (stats ?? []).map((s: Record<string, unknown>) => [s.id as string, s])
  );
  const analysed = new Set((analysisRuns ?? []).map((r: { survey_id: string }) => r.survey_id));
  const responseCountOf = (id: string) => (statsMap.get(id)?.response_count as number) ?? 0;

  // ── Authoritative analysis eligibility (the SAME rule as the detail page) ──
  // Eligibility ⟺ the survey's MAX answered base ≥ ANALYSIS_MIN_BASE. That max is
  // always Q1's (answering is sequential). Q1 base = completed responses for a
  // historical survey (exact) or the count of first-question answers for a
  // studio-native one (partial-aware, ≥ completed). So response_count ≥ the gate
  // ⟹ eligible for BOTH modes with NO answer read. Only THIN surveys
  // (response_count < gate) can gain eligibility from studio-native partials, so we
  // fetch first-question answers ONLY for those — a single batched read, never N+1.
  const surveyIds = (surveys ?? []).map((s) => s.id as string);
  const thinIds = surveyIds.filter((id) => responseCountOf(id) < ANALYSIS_MIN_BASE);
  const q1Extra = new Map<string, number>(); // surveyId → first-question answered count (studio-native)
  if (thinIds.length) {
    const { data: thinCamps } = await supabaseAdmin
      .from("campaigns").select("survey_id, campaign_id").in("survey_id", thinIds).is("deleted_at", null);
    const slugToSurvey = new Map<string, string>();
    for (const c of thinCamps ?? []) if (c.campaign_id) slugToSurvey.set(c.campaign_id as string, c.survey_id as string);
    const slugs = [...slugToSurvey.keys()];
    if (slugs.length) {
      // Only the FIRST question's real answers (the max-base question). Minimal payload.
      const { data: ans } = await supabaseAdmin
        .from("response_answers").select("campaign_id").eq("question_index", 0).eq("is_demo", false).in("campaign_id", slugs);
      for (const a of ans ?? []) {
        const sid = slugToSurvey.get(a.campaign_id as string);
        if (sid) q1Extra.set(sid, (q1Extra.get(sid) ?? 0) + 1);
      }
    }
  }

  const data = (surveys ?? []).map((s: Record<string, unknown>) => {
    const id = s.id as string;
    const st = statsMap.get(id);
    const rc = (st?.response_count as number) ?? 0;
    // Max answered base = Q1 base = max(completed responses, studio-native Q1 answers).
    const maxBase = Math.max(rc, q1Extra.get(id) ?? 0);
    const { eligible, reason } = surveyAnalysisEligibility(maxBase);
    return {
      ...s,
      campaign_count:      (st?.campaign_count      as number) ?? 0,
      live_campaign_count: (st?.live_campaign_count  as number) ?? 0,
      response_count:      rc,
      last_used_at:        (st?.last_used_at         as string | null) ?? null,
      last_response_at:    (st?.last_response_at     as string | null) ?? null,
      has_analysis:        analysed.has(id),
      analysis_eligible:   eligible,
      analysis_reason:     reason,
    };
  });

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireUser(req, ["admin", "publisher"]);
  } catch (err) {
    return err as Response;
  }

  const body = await req.json();

  // Strip computed/lifecycle/identity fields — the DB owns these. study_id is
  // pulled out and validated separately (never trusted raw from the client).
  const {
    id: _id, created_at: _ca, updated_at: _ua,
    archived_at: _aa, deleted_at: _da, deleted_by: _db,
    delete_reason: _dr, created_by: _cb, organisation_id: _oid,
    campaign_count: _cc, live_campaign_count: _lcc, response_count: _rc,
    study_id: _sid,
    _action: _act,
    ...rest
  } = body;

  // Study membership (Create Survey in Study). Study curation is admin-only, so a
  // non-admin can never attach a survey to a study; the study must exist.
  let studyId: string | null = null;
  if (typeof _sid === "string" && _sid) {
    if (session.role !== "admin") return NextResponse.json({ error: "Forbidden", code: "study_admin_only" }, { status: 403 });
    const { data: study } = await supabaseAdmin.from("studies").select("id").eq("id", _sid).single();
    if (!study) return NextResponse.json({ error: "Invalid study." }, { status: 400 });
    studyId = _sid;
  }

  // Publisher accounts can only ever create surveys for their own
  // organisation — enforced here regardless of what the UI sent.
  const organisationId = session.role === "publisher" ? session.organisationId : null;

  // Optional organisation references (brand_org_id/agency_org_id) are uuid
  // columns. An unselected picker in the Create Survey drawer arrives as ""
  // (its form default), which Postgres rejects for a uuid — coerce blank
  // ids to null so leaving Brand/Agency unset saves cleanly.
  const cleaned = nullifyBlankUuids(rest);
  // Stage 5D: governed semantic metadata is (re)established SERVER-SIDE from each
  // question's declared scale_template alone — any client-sent polarity/ordinal is
  // discarded, and questions without a valid template carry no semantics.
  if ("questions" in cleaned) cleaned.questions = governSurveyQuestions(cleaned.questions);

  // Brand/Agency references (if any) must resolve to a real, non-deleted org of the
  // correct type — never an arbitrary UUID or a wrong-type org. Attribution ≠ access.
  {
    const ids = [cleaned.brand_org_id, cleaned.agency_org_id].filter((v): v is string => typeof v === "string" && v !== "");
    if (ids.length) {
      const { data: refRows } = await supabaseAdmin.from("organisations").select("id, type, deleted_at").in("id", ids);
      const refErr = brandAgencyRefError(cleaned.brand_org_id, cleaned.agency_org_id, (refRows ?? []) as OrgRefRow[]);
      if (refErr) return NextResponse.json({ error: refErr, code: "invalid_org_reference" }, { status: 400 });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("surveys")
    .insert([{ ...cleaned, created_by: session.workEmail, organisation_id: organisationId, study_id: studyId, updated_at: new Date().toISOString() }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Publisher self-service: the OWNING organisation is enrolled as data-entitled to
  // this survey's research data (the single governed authority — never ownership,
  // attribution or distribution standing in for it). Best-effort: a failure here
  // never blocks survey creation; campaign generation re-ensures the scope, and the
  // enrolment is idempotent. Admin-authored surveys (organisation_id NULL) get NO
  // client grant here — commissioned entitlement is granted at the Request hand-off.
  if (organisationId && data?.id) {
    try {
      await grantSurveyDataEntitlement(data.id, organisationId, { actor: session.workEmail });
    } catch (e) {
      console.error("[surveys] data-entitlement grant failed (survey created):", e);
    }
  }

  return NextResponse.json({ data });
}
