// Generates and persists a Research Project's Key Findings — structural
// mirror of app/api/research-projects/[id]/reports/executive/route.ts,
// but deliberately no edit/approve/publish siblings: this output type
// has no review lifecycle (see lib/intelligence/analysts/
// analyseKeyFindings.ts's header comment for why), so it's just
// GET (fetch current) and POST (regenerate outright, no confirm gate
// since there's nothing reviewed to lose by overwriting it).
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { analyseKeyFindings } from "@/lib/intelligence/analysts/analyseKeyFindings";
import { getSummary, saveDraft } from "@/lib/intelligence/store";
import { IntelligenceError } from "@/lib/intelligence/types";
import { logActivity } from "@/lib/research-project-activity";

export type { KeyFindingsReport, KeyFinding } from "@/lib/intelligence/analysts/analyseKeyFindings";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { id } = await params;
  const data = await getSummary("research_project", id, "key_findings");
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { id } = await params;

  try {
    const report = await analyseKeyFindings(id);
    const saved  = await saveDraft({
      sourceType:  "research_project",
      sourceId:    id,
      outputType:  "key_findings",
      content:     report,
      model:       "gpt-4o",
      generatedBy: session.workEmail,
    });
    await logActivity(id, "report_generated", "Key Findings generated", session.workEmail);
    return NextResponse.json({ data: saved });
  } catch (err) {
    if (err instanceof IntelligenceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to generate Key Findings." }, { status: 500 });
  }
}
