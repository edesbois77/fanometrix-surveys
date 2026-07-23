// The Research Design endpoint — the project artefact that decides what evidence
// is worth collecting, before any collection begins (lib/research-design.ts).
//
//   GET   read the stored design
//   POST  generate a design from the commission and save it as a draft
//   PUT   save an edited design, or APPROVE it
//
// Approval is the gate: the user approves the STRATEGY, never the search terms.
// Only an approved design may generate Conversation Searches (Phase 3).
//
// Stored as jsonb on research_projects, the same pattern as understanding /
// engagement_context / brief (migrations 129 / 131 / 132 / 134).
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { IntelligenceError } from "@/lib/intelligence/types";
import { analyseResearchDesign } from "@/lib/intelligence/analysts/analyseResearchDesign";
import type { ResearchDesign } from "@/lib/research-design";
import type { EngagementContext } from "@/lib/engagement-context";
import type { Brief } from "@/lib/brief";

type ProjectRow = {
  research_question: string | null;
  objective: string | null;
  engagement_context: EngagementContext | null;
  brief: Brief | null;
  research_design: ResearchDesign | null;
};

async function loadProject(id: string): Promise<ProjectRow | null> {
  const { data } = await supabaseAdmin
    .from("research_projects")
    .select("research_question, objective, engagement_context, brief, research_design")
    .eq("id", id)
    .maybeSingle<ProjectRow>();
  return data ?? null;
}

async function saveDesign(id: string, design: ResearchDesign) {
  const { error } = await supabaseAdmin
    .from("research_projects")
    .update({ research_design: design, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new IntelligenceError(500, error.message);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin", "publisher"]); } catch (err) { return err as Response; }
  const { id } = await params;
  const proj = await loadProject(id);
  if (!proj) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json({ data: proj.research_design ?? null });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;

  try {
    const proj = await loadProject(id);
    if (!proj) return NextResponse.json({ error: "Project not found." }, { status: 404 });

    // Regenerating over an APPROVED design discards an approval, so it must be
    // deliberate. Mirrors the confirm guard the report outputs use.
    const body = await req.json().catch(() => ({}));
    if (proj.research_design?.status === "approved" && body?.confirm !== true) {
      return NextResponse.json(
        { error: "This design is already approved. Regenerating will discard the approval.", code: "confirm_required" },
        { status: 409 },
      );
    }

    const design = await analyseResearchDesign({
      researchQuestion: proj.research_question,
      researchObjective: proj.objective,
      context: proj.engagement_context,
      brief: proj.brief,
    });
    // The collection window is COMMISSIONED, not generated: it is a decision the
    // client made about the period the research must cover, so re-designing the
    // strategy must not silently discard it. Everything else is regenerated.
    if (proj.research_design?.collection_window) {
      design.collection_window = proj.research_design.collection_window;
    }
    await saveDesign(id, design);
    return NextResponse.json({ data: design }, { status: 201 });
  } catch (err) {
    if (err instanceof IntelligenceError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Couldn't design the research. Try again." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;

  try {
    const proj = await loadProject(id);
    if (!proj) return NextResponse.json({ error: "Project not found." }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const incoming = (body?.design ?? proj.research_design) as ResearchDesign | null;
    if (!incoming) return NextResponse.json({ error: "There is no design to save yet." }, { status: 422 });

    const approving = body?.approve === true;
    const design: ResearchDesign = {
      ...incoming,
      status: approving ? "approved" : incoming.status ?? "draft",
      approved_at: approving ? new Date().toISOString() : incoming.approved_at ?? null,
      approved_by: approving ? session.workEmail : incoming.approved_by ?? null,
    };
    await saveDesign(id, design);
    return NextResponse.json({ data: design });
  } catch (err) {
    if (err instanceof IntelligenceError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Couldn't save the design. Try again." }, { status: 500 });
  }
}
