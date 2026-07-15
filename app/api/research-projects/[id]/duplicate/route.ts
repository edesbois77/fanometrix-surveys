// Simulated-only. Creates a new, empty Product Walkthrough container from
// the source project's name/research_question/client_label/internal_notes
// — same creation path the Library's "New Product Walkthrough" drawer uses
// (createEmptySimulatedProject). No evidence is copied forward and no
// generation is triggered: instant bulk-generation from a source_config is
// no longer how this works — everything a walkthrough contains gets built
// inside the workspace itself, step by step, the same as any other.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { logActivity } from "@/lib/research-project-activity";
import { createEmptySimulatedProject } from "@/lib/simulation/create-simulated-project";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser(req);
  } catch (err) {
    return err as Response;
  }
  if (session.role !== "admin" && !session.canPresentSimulations) {
    return NextResponse.json({ error: "You don't have access to Product Walkthrough." }, { status: 403 });
  }

  const { id } = await params;

  const { data: source } = await supabaseAdmin
    .from("research_projects")
    .select("project_name, topic, research_mode, research_question, client_label, internal_notes")
    .eq("id", id)
    .single();
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (source.research_mode !== "simulated") {
    return NextResponse.json({ error: "Duplicate is only available for Product Walkthroughs." }, { status: 403 });
  }

  // The short Research Name, not the classification-suffixed project_name
  // — matches what the gallery card itself displays.
  const sourceName = source.topic?.trim() || source.project_name;

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : `${sourceName} (Copy)`;

  let result;
  try {
    result = await createEmptySimulatedProject({
      name,
      researchQuestion: source.research_question,
      clientLabel: source.client_label,
      internalNotes: source.internal_notes,
      actor: session.workEmail,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to duplicate the walkthrough." }, { status: 500 });
  }

  await logActivity(result.projectId, "simulation_duplicated", `Duplicated from "${sourceName}".`, session.workEmail);

  return NextResponse.json({ data: { id: result.projectId } }, { status: 201 });
}
