// ── Manage → Survey → Findings: create (from a Result) + list ────────────────
// Fanometrix editorial layer between Results and (later) Discover. Curation is
// admin/operator ONLY, on top of Manage ownership. A Finding's numbers are ALWAYS
// server-recomputed via the trusted Results resolver — never trusted from the
// browser, which submits only the result IDENTITY. See lib/studio/survey-finding.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadManagedSurvey, resolveSurveyResults } from "@/lib/studio/survey-results-resolve";
import {
  canCurateFindings, cleanFilters, validateEditorial, buildAnswerFindingSnapshot, isSnapshotError, findingCard,
  type FindingRow,
} from "@/lib/studio/survey-finding";

const FINDING_COLS = "id, survey_id, status, headline, commentary, source_type, question_index, question_id, option_id, filters, display_language, base_n, answer_count, percentage, shown, answered, question_completion, snapshot, created_at, published_at, published_by, created_by";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let session: AuthedUser;
  try { session = await requireUser(req); } catch { return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }

  const survey = await loadManagedSurvey(session, id);
  if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  if (!canCurateFindings(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data } = await supabaseAdmin
    .from("survey_findings").select(FINDING_COLS)
    .eq("survey_id", id).order("created_at", { ascending: false });
  return NextResponse.json({ findings: (data ?? []).map((r) => findingCard(r as FindingRow)) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let session: AuthedUser;
  try { session = await requireUser(req); } catch { return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }

  const survey = await loadManagedSurvey(session, id);
  if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 }); // existence-preserving
  if (!canCurateFindings(session)) return NextResponse.json({ error: "Forbidden", code: "curation_admin_only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const editorial = validateEditorial(body);
  if ("error" in editorial) return NextResponse.json({ error: editorial.error }, { status: 400 });

  const questionIndex = Number(body?.questionIndex);
  const optionId = typeof body?.optionId === "string" ? body.optionId : "";
  if (!Number.isInteger(questionIndex) || !optionId) {
    return NextResponse.json({ error: "A question and answer are required.", code: "invalid_source" }, { status: 400 });
  }
  const filters = cleanFilters(body?.filters);

  // Re-resolve the result server-side and build the canonical snapshot. Client numbers
  // are ignored entirely.
  const resolved = await resolveSurveyResults(survey, filters, typeof body?.displayLanguage === "string" ? body.displayLanguage : null);
  const snap = buildAnswerFindingSnapshot(resolved.questions, { questionIndex, optionId, displayLanguage: resolved.displayLanguage });
  if (isSnapshotError(snap)) {
    const msg = snap.error === "zero_base"
      ? "This result has no valid answers yet, so it can't become a Finding."
      : "That question or answer is no longer part of this survey.";
    return NextResponse.json({ error: msg, code: snap.error }, { status: snap.error === "zero_base" ? 422 : 404 });
  }

  const { data, error } = await supabaseAdmin.from("survey_findings").insert({
    survey_id: id,
    source_type: "answer",
    question_index: questionIndex,
    question_id: snap.questionId,
    option_id: optionId,
    filters,
    display_language: resolved.displayLanguage,
    base_n: snap.base_n,
    answer_count: snap.answer_count,
    percentage: snap.percentage,
    shown: snap.shown,
    answered: snap.answered,
    question_completion: snap.question_completion,
    snapshot: snap.snapshot,
    headline: editorial.headline,
    commentary: editorial.commentary,
    status: "draft",
    created_by: session.workEmail,
    updated_by: session.workEmail,
  }).select(FINDING_COLS).single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ finding: data }, { status: 201 });
}
