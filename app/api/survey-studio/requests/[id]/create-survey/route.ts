import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { handoffEligibility, buildSurveyFromRequest, type RequestForHandoff } from "@/lib/research-request";
import { grantSurveyDataEntitlement } from "@/lib/studio/data-entitlement";

// ── Survey Studio — accepted Request → Create hand-off ───────────────────────
// POST → seed a NORMAL Survey Studio Create survey from an ACCEPTED Request and
// link it back (research_requests.survey_id). This is the ONLY place a Request
// turns into a Survey. It copies only compatible About fields + Brand/Agency by
// STABLE ID (see lib/research-request.buildSurveyFromRequest); it never copies
// questions, creative, campaign or deploy state. After this, Create owns the
// Survey — the Request just keeps a reference.
//
// Idempotent & duplicate-proof: the survey is created first, then the Request is
// claimed with a `survey_id IS NULL` guard. If a concurrent/repeat call already
// claimed it, this call's freshly-created survey is rolled back (deleted) and the
// EXISTING survey is returned — never a second survey (belt-and-braces with the
// partial UNIQUE index in migration 188).

// Find-or-create the Study for a Request. Idempotent via the unique
// research_request_id index (one Study per Request) — retry/race safe.
async function ensureStudyForRequest(
  request: { id: string; name: string | null; objective: string | null; organisation_id: string | null },
  actor: string | null,
): Promise<string | null> {
  const existing = await supabaseAdmin.from("studies").select("id").eq("research_request_id", request.id).maybeSingle();
  if (existing.data) return existing.data.id as string;
  const created = await supabaseAdmin.from("studies").insert({
    name: request.name || "Untitled research",
    objective: request.objective ?? null,
    commissioning_organisation_id: request.organisation_id ?? null,
    research_request_id: request.id,
    status: "active",
    created_by: actor,
  }).select("id").single();
  if (!created.error && created.data) return created.data.id as string;
  // Lost the race on the unique index — re-read the winner.
  const reread = await supabaseAdmin.from("studies").select("id").eq("research_request_id", request.id).maybeSingle();
  return (reread.data?.id as string) ?? null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    // Running the hand-off (accepting a Request into Create) is a Fanometrix action.
    session = await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;

  const { data: request } = await supabaseAdmin.from("research_requests").select("*").eq("id", id).single();
  if (!request) return NextResponse.json({ error: "Request not found." }, { status: 404 });

  const eligibility = handoffEligibility(request as RequestForHandoff);
  if (!eligibility.ok) {
    if (eligibility.reason === "already_created") {
      // No-op: return the survey that already exists for this Request.
      return NextResponse.json({ data: { survey_id: request.survey_id }, already_created: true });
    }
    return NextResponse.json(
      { error: "Only an accepted request can be turned into a survey.", code: "not_accepted" },
      { status: 409 },
    );
  }

  // Convenience "create research from Request": ensure a Study for this Request
  // (idempotent — one Study per Request via the unique index), then seed the initial
  // Survey INSIDE it. The Study is the durable research initiative and can receive
  // more Surveys later; it does not depend on this Survey. Study curation elsewhere is
  // admin-only, and this hand-off is already admin-gated.
  const studyId = await ensureStudyForRequest(request, session.workEmail);
  if (!studyId) {
    return NextResponse.json({ error: "Could not create the study for this request." }, { status: 500 });
  }

  // The seed survey is created for the REQUESTING organisation (attribution chain:
  // Organisation → Request → Study → Survey), not the acting admin's context.
  const seed = buildSurveyFromRequest(request as RequestForHandoff);
  const { data: survey, error: surveyErr } = await supabaseAdmin
    .from("surveys")
    .insert([{
      ...seed,
      organisation_id: request.organisation_id,
      study_id: studyId,
      created_by: session.workEmail,
      updated_at: new Date().toISOString(),
    }])
    .select()
    .single();
  if (surveyErr || !survey) {
    return NextResponse.json({ error: surveyErr?.message ?? "Could not create the survey." }, { status: 500 });
  }

  // Claim the Request atomically: only set survey_id if it is still NULL. If a
  // concurrent call won the race, 0 rows update → discard this survey and return
  // the winner's.
  const { data: claimed } = await supabaseAdmin
    .from("research_requests")
    .update({ survey_id: survey.id, updated_at: new Date().toISOString() })
    .eq("id", id)
    .is("survey_id", null)
    .select()
    .maybeSingle();

  if (!claimed) {
    // Lost the race (or already claimed): roll back the just-created survey and
    // return the survey that actually holds the claim.
    await supabaseAdmin.from("surveys").delete().eq("id", survey.id);
    const { data: current } = await supabaseAdmin.from("research_requests").select("survey_id").eq("id", id).single();
    return NextResponse.json({ data: { survey_id: current?.survey_id ?? null }, already_created: true });
  }

  // Commissioned research: the COMMISSIONING organisation (the governed Request
  // organisation) is enrolled as data-entitled to the resulting survey's research
  // data. This is the ONLY entitlement source here — never brand_org_id /
  // agency_org_id (attribution) or publisher_org_id (distribution). If there were
  // no unambiguous commissioning organisation we would NOT guess (leave ungranted
  // + surface); research_requests.organisation_id is NOT NULL, so it is present.
  // Best-effort: a failure never un-does the created survey (campaign generation
  // re-ensures the scope; the grant is idempotent).
  if (request.organisation_id) {
    try {
      await grantSurveyDataEntitlement(survey.id, request.organisation_id, { actor: session.workEmail });
    } catch (e) {
      console.error("[create-survey] commissioning data-entitlement grant failed (survey created):", e);
    }
  } else {
    console.error(`[create-survey] request ${id} has no commissioning organisation — data entitlement left ungranted (not guessed).`);
  }

  return NextResponse.json({ data: { survey_id: survey.id }, request: claimed }, { status: 201 });
}
