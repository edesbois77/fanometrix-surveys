// Diagnostic: how many responses the survey extractor actually counts for each
// attached survey, and how it resolved them (via survey_id vs campaign
// membership). Surfaced on the Findings overview so a wrong count (e.g. a flat
// 196 instead of the true per-question population) is visible and explainable
// rather than a mystery.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { surveyPopulation } from "@/lib/analysis/source-findings/survey-population";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id: projectId } = await params;

  const { data: links } = await supabaseAdmin
    .from("research_project_evidence")
    .select("evidence_id")
    .eq("research_project_id", projectId)
    .eq("evidence_type", "survey");

  const surveys = await Promise.all(
    (links ?? []).map(l => surveyPopulation(l.evidence_id as string)),
  );

  return NextResponse.json({ data: { surveys: surveys.filter(Boolean) } });
}
