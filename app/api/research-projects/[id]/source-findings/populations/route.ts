// Diagnostic: the question-level response population the survey findings are
// computed from — the project totals (the denominators findings actually use)
// plus each attached survey's completed count for context. Counted directly from
// raw campaign response rows (lib/analysis/source-findings/survey-population.ts),
// never from a report.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { surveyPopulationStats } from "@/lib/analysis/source-findings/survey-population";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id: projectId } = await params;
  return NextResponse.json({ data: await surveyPopulationStats(projectId) });
}
