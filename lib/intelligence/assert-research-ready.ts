// Server-side gate for Intelligence generation on a simulated source —
// the modal-level check (SurveyIntelligenceModal/ConversationIntelligenceModal)
// is UX only; this is the one that can't be bypassed by calling the API
// directly. Separate from, and in addition to, analyseSurvey.ts's
// MIN_RESPONSES / analyseConversation.ts's zero-mentions checks — those
// stay exactly as they are for every project, real or simulated.
//
// research_project_evidence_id (not survey_id/search_id alone) is what
// pins down exactly which attachment — and therefore which project — the
// caller means: the same survey could in principle be attached to more
// than one project, each with its own simulation run. The evidence row's
// own evidence_type/evidence_id must match what's actually being
// requested, or this is rejected outright rather than silently resolving
// the wrong project's run.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { IntelligenceError } from "@/lib/intelligence/types";

export async function assertSimulatedResearchReady(
  evidenceType: "survey" | "social_search",
  sourceId: string,
  researchProjectEvidenceId?: string | null
): Promise<void> {
  if (!researchProjectEvidenceId) {
    // No project context supplied. Fine for a real source — unchanged
    // behaviour, no simulation record required. A simulated source can
    // never legitimately reach this with no evidence row at all (simulated
    // data only ever exists via a Product Walkthrough's attached evidence),
    // so treat that combination as the caller skipping the gate.
    const table = evidenceType === "survey" ? "surveys" : "social_searches";
    const { data: source } = await supabaseAdmin.from(table).select("is_simulated").eq("id", sourceId).single();
    if (source?.is_simulated) {
      throw new IntelligenceError(400, "research_project_evidence_id is required to generate Intelligence for a simulated source.");
    }
    return;
  }

  const { data: evidenceRow } = await supabaseAdmin
    .from("research_project_evidence")
    .select("id, research_project_id, evidence_type, evidence_id")
    .eq("id", researchProjectEvidenceId)
    .single();

  if (!evidenceRow || evidenceRow.evidence_type !== evidenceType || evidenceRow.evidence_id !== sourceId) {
    throw new IntelligenceError(403, "This research source doesn't match the requested evidence row.");
  }

  const { data: project } = await supabaseAdmin
    .from("research_projects")
    .select("research_mode")
    .eq("id", evidenceRow.research_project_id)
    .single();

  if (!project || project.research_mode !== "simulated") {
    // Real project — no simulation record required, behaviour unchanged.
    return;
  }

  const { data: run } = await supabaseAdmin
    .from("evidence_simulations")
    .select("status, error_message")
    .eq("research_project_evidence_id", researchProjectEvidenceId)
    .maybeSingle();

  if (!run) {
    throw new IntelligenceError(400, "Run Research for this source in Research Sources before generating Intelligence.");
  }
  if (run.status === "generating") {
    throw new IntelligenceError(409, "Research is still running for this source.");
  }
  if (run.status === "failed") {
    throw new IntelligenceError(400, `Research failed for this source${run.error_message ? `: ${run.error_message}` : ""}, retry it in Research Sources before generating Intelligence.`);
  }
  // run.status === "ready" — proceed.
}
