// Turn an APPROVED Evidence Strategy into News Coverage tasks. Sibling of
// generate-searches, with the same contract: idempotent (re-running reconciles
// against the design_origin recorded on each generated task, so it updates
// rather than duplicates) and refusing to run on an unapproved design.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { IntelligenceError } from "@/lib/intelligence/types";
import { generateNewsTasksFromDesign } from "@/lib/research-sources/generate-news-tasks-from-design";
import type { ResearchDesign } from "@/lib/research-design";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;

  try {
    const { data: proj } = await supabaseAdmin
      .from("research_projects")
      .select("research_design")
      .eq("id", id)
      .maybeSingle<{ research_design: ResearchDesign | null }>();
    if (!proj) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    if (!proj.research_design) return NextResponse.json({ error: "Design the research before generating News Coverage tasks." }, { status: 422 });

    const result = await generateNewsTasksFromDesign(id, proj.research_design, session.workEmail);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    if (err instanceof IntelligenceError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Couldn't generate the News Coverage tasks. Try again." }, { status: 500 });
  }
}
