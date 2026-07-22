// Phase 3 — turn an APPROVED Evidence Strategy into Conversation Intelligence
// searches. Idempotent: re-running after a strategy update reconciles against the
// design_origin recorded on each generated search, so it updates rather than
// duplicates. Generation refuses to run on an unapproved design.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { IntelligenceError } from "@/lib/intelligence/types";
import { generateSearchesFromDesign } from "@/lib/research-sources/generate-searches-from-design";
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
    if (!proj.research_design) return NextResponse.json({ error: "Design the research before generating searches." }, { status: 422 });

    const result = await generateSearchesFromDesign(id, proj.research_design, session.workEmail);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    if (err instanceof IntelligenceError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Couldn't generate the searches. Try again." }, { status: 500 });
  }
}
