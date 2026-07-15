// Simulated-only. Clears every row tied to the project's
// evidence_simulations run and regenerates from the same config —
// "This clears the synthetic evidence and starts fresh — nothing else
// changes" (Demo Projects UX review). 403 on a real project; there is
// no equivalent action for real research.
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { logActivity } from "@/lib/research-project-activity";
import { runSimulationGeneration } from "@/lib/simulation/run-simulation-generation";
import type { SimulationSourceConfig } from "@/lib/simulation/types";

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

  const { data: project } = await supabaseAdmin.from("research_projects").select("research_mode").eq("id", id).single();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.research_mode !== "simulated") {
    return NextResponse.json({ error: "Reset is only available for Product Walkthroughs." }, { status: 403 });
  }

  const { data: evidenceSim } = await supabaseAdmin
    .from("evidence_simulations")
    .select("id, source_config")
    .eq("research_project_id", id)
    // Legacy project-wide run only — a per-source "Run Research" row
    // (migration 095) is reset via its own source card, never by this
    // whole-project Reset action.
    .is("research_project_evidence_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!evidenceSim) return NextResponse.json({ error: "No Simulation run found for this project." }, { status: 404 });

  const [{ data: campaign }, { data: evidenceRows }] = await Promise.all([
    supabaseAdmin.from("campaigns").select("campaign_id, survey_id").eq("research_project_id", id).maybeSingle(),
    supabaseAdmin.from("research_project_evidence").select("evidence_type, evidence_id").eq("research_project_id", id),
  ]);
  const searchId = (evidenceRows ?? []).find(e => e.evidence_type === "social_search")?.evidence_id ?? null;

  await Promise.all([
    supabaseAdmin.from("responses").delete().eq("evidence_simulation_id", evidenceSim.id),
    supabaseAdmin.from("social_mentions").delete().eq("evidence_simulation_id", evidenceSim.id),
  ]);

  await supabaseAdmin.from("evidence_simulations")
    .update({ status: "generating", generated_at: null, presented_count: 0 })
    .eq("id", evidenceSim.id);

  await logActivity(id, "simulation_reset", "Product Walkthrough evidence reset, regenerating.", session.workEmail);

  const config = evidenceSim.source_config as SimulationSourceConfig;
  after(() => runSimulationGeneration({
    researchProjectId: id,
    evidenceSimulationId: evidenceSim.id,
    config,
    campaignId: campaign?.campaign_id ?? null,
    surveyId: campaign?.survey_id ?? null,
    searchId,
    actor: session.workEmail,
  }));

  return NextResponse.json({ data: { status: "generating" } });
}
