// ── Manage → Survey → Finding: detail + editorial edit + publish ─────────────
// Curation is admin/operator ONLY, on top of Manage ownership. Editorial PATCH
// touches ONLY headline/commentary — never analytical provenance/snapshot.
// Publishing RE-RESOLVES the SAME canonical provenance server-side and FREEZES the
// snapshot at that moment (later fieldwork never silently changes a published
// number); changing the analytical source requires a NEW Finding, not a rewrite.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadManagedSurvey, resolveSurveyResults } from "@/lib/studio/survey-results-resolve";
import { canCurateFindings, editorialPatch, buildAnswerFindingSnapshot, isSnapshotError } from "@/lib/studio/survey-finding";

const FINDING_COLS = "id, survey_id, status, headline, commentary, source_type, question_index, question_id, option_id, filters, display_language, base_n, answer_count, percentage, shown, answered, question_completion, snapshot, created_at, updated_at, published_at, published_by, created_by";

async function authorise(req: NextRequest, surveyId: string) {
  let session: AuthedUser;
  try { session = await requireUser(req); } catch { return { error: NextResponse.json({ error: "Unauthorised" }, { status: 401 }) }; }
  const survey = await loadManagedSurvey(session, surveyId);
  if (!survey) return { error: NextResponse.json({ error: "Survey not found" }, { status: 404 }) };
  if (!canCurateFindings(session)) return { error: NextResponse.json({ error: "Forbidden", code: "curation_admin_only" }, { status: 403 }) };
  return { session, survey };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; findingId: string }> }) {
  const { id, findingId } = await ctx.params;
  const a = await authorise(req, id);
  if ("error" in a) return a.error;

  const { data } = await supabaseAdmin.from("survey_findings").select(FINDING_COLS).eq("id", findingId).eq("survey_id", id).single();
  if (!data) return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  return NextResponse.json({ finding: data });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; findingId: string }> }) {
  const { id, findingId } = await ctx.params;
  const a = await authorise(req, id);
  if ("error" in a) return a.error;
  const { session, survey } = a;

  const { data: existing } = await supabaseAdmin.from("survey_findings").select(FINDING_COLS).eq("id", findingId).eq("survey_id", id).single();
  if (!existing) return NextResponse.json({ error: "Finding not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();

  // ── Publish: re-resolve the SAME provenance and freeze the snapshot ──────────
  if (body?._action === "publish") {
    const filters = (existing.filters ?? {}) as Record<string, string | null>;
    const resolved = await resolveSurveyResults(survey, filters, existing.display_language as string | null);
    const snap = buildAnswerFindingSnapshot(resolved.questions, {
      questionIndex: existing.question_index as number,
      optionId: existing.option_id as string,
      displayLanguage: (existing.display_language as string) ?? resolved.displayLanguage,
    });
    if (isSnapshotError(snap)) {
      return NextResponse.json({ error: "This result can no longer be resolved, so it can't be published. Create a new Finding from a current result.", code: snap.error }, { status: 409 });
    }
    const { data, error } = await supabaseAdmin.from("survey_findings").update({
      base_n: snap.base_n, answer_count: snap.answer_count, percentage: snap.percentage,
      shown: snap.shown, answered: snap.answered, question_completion: snap.question_completion, snapshot: snap.snapshot,
      status: "published", published_by: session.workEmail, published_at: now, updated_by: session.workEmail, updated_at: now,
    }).eq("id", findingId).eq("survey_id", id).select(FINDING_COLS).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ finding: data });
  }

  // ── Editorial edit: headline/commentary ONLY (never provenance/snapshot) ─────
  const patch = editorialPatch(body);
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  const { data, error } = await supabaseAdmin.from("survey_findings")
    .update({ ...patch, updated_by: session.workEmail, updated_at: now })
    .eq("id", findingId).eq("survey_id", id).select(FINDING_COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ finding: data });
}
