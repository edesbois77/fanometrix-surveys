// PROOF diagnostic (read-only, changes no behaviour). For each attached survey it
// reports, side by side:
//   1. VERSION — a marker proving which deployed code is answering.
//   2. EXTRACTOR — the per-question counts the Findings extractor ACTUALLY sees,
//      computed through its real code path (surveyResponseRows → per-question
//      non-null counts). This is the number Findings uses as each denominator.
//   3. FULL CAMPAIGN POPULATION — the per-question counts over EVERY response
//      under the survey's campaigns (campaigns discovered via the survey's own
//      responses), unfiltered by survey_id/is_demo — i.e. the report population.
//
// If EXTRACTOR shows 196/196/196 while FULL shows 652/317/274, the extractor is
// reading the wrong dataset (fix is before/at fetch). If EXTRACTOR already shows
// 652/317/274, the bug is after extraction.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { surveyResponseRows } from "@/lib/analysis/source-findings/survey-population";

// Bump on each deploy that changes this file, so the panel proves which code ran.
const DIAGNOSTIC_VERSION = "v4-proof-2026-07-24";

type QRow = { q1: string | null; q2: string | null; q3: string | null; survey_id?: string | null; is_demo?: boolean };
const answered = (rows: QRow[], key: "q1" | "q2" | "q3") => rows.filter(r => r[key] != null && r[key] !== "").length;
const perQuestion = (rows: QRow[]) => ({ total: rows.length, q1: answered(rows, "q1"), q2: answered(rows, "q2"), q3: answered(rows, "q3") });

async function pageAll(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null }>): Promise<QRow[]> {
  const PAGE = 1000;
  const out: QRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await build(from, from + PAGE - 1);
    const rows = (data ?? []) as QRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function surveyDiag(surveyId: string, name: string) {
  // 2. What the extractor actually reads — its real code path.
  const extractorRows = await surveyResponseRows(surveyId) as unknown as QRow[];
  const extractor = perQuestion(extractorRows);

  // 3. Full campaign population: discover the survey's campaigns via its own
  // responses' campaign_id, then count EVERY response under them (any survey_id,
  // any is_demo), per question — the report population.
  const { data: attr } = await supabaseAdmin
    .from("responses").select("campaign_id").eq("survey_id", surveyId).limit(50000);
  const campaignIds = [...new Set(((attr ?? []) as { campaign_id: string | null }[]).map(r => r.campaign_id).filter((c): c is string => !!c))];

  let full: (ReturnType<typeof perQuestion> & { campaigns: number; real: number; demo: number; nullSurveyId: number }) | null = null;
  if (campaignIds.length) {
    const rows = await pageAll((from, to) => supabaseAdmin
      .from("responses").select("q1, q2, q3, survey_id, is_demo").in("campaign_id", campaignIds).order("id").range(from, to));
    full = {
      ...perQuestion(rows),
      campaigns: campaignIds.length,
      real: rows.filter(r => r.is_demo === false).length,
      demo: rows.filter(r => r.is_demo === true).length,
      nullSurveyId: rows.filter(r => r.survey_id == null).length,
    };
  }

  // Mapping checks: does campaigns.survey_id find anything?
  const { data: bySurveyIdCampaigns } = await supabaseAdmin
    .from("campaigns").select("campaign_id").eq("survey_id", surveyId);

  return {
    surveyId, name,
    extractor,
    campaignsBySurveyId: (bySurveyIdCampaigns ?? []).length,
    campaignsViaResponses: campaignIds.length,
    full,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id: projectId } = await params;

  const { data: proj } = await supabaseAdmin
    .from("research_projects").select("survey_id, research_mode").eq("id", projectId).maybeSingle();
  const { data: links } = await supabaseAdmin
    .from("research_project_evidence").select("evidence_id").eq("research_project_id", projectId).eq("evidence_type", "survey");
  const surveyIds = (links ?? []).map(l => l.evidence_id as string);
  const { data: surveys } = surveyIds.length
    ? await supabaseAdmin.from("surveys").select("id, name").in("id", surveyIds)
    : { data: [] as { id: string; name: string }[] };

  const perSurvey = await Promise.all((surveys ?? []).map(s => surveyDiag(s.id, s.name)));

  return NextResponse.json({
    data: {
      diagnosticVersion: DIAGNOSTIC_VERSION,
      projectSurveyId: (proj?.survey_id as string | null) ?? null,
      researchMode: proj?.research_mode ?? null,
      surveys: perSurvey,
    },
  });
}
