// Creates a complete simulated Research Project: the project row, its
// evidence_simulations run record, a simulated survey and/or
// conversation search per source_config, the one campaign that holds
// the survey's evidence, and the research_project_evidence attachments
// — everything needed before generation can run. Deliberately does NOT
// trigger generation itself (see lib/simulation/run-simulation-generation.ts)
// — that's the caller's job, via next/server's after(), so this helper
// stays request-lifecycle-agnostic and reusable by both project
// creation and Duplicate.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { toSlugPart } from "@/lib/naming";
import { logActivity } from "@/lib/research-project-activity";
import { DEFAULT_SIMULATED_SURVEY_QUESTIONS } from "@/lib/simulation/default-survey-questions";
import type { SimulationSourceConfig } from "@/lib/simulation/types";

function shortId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export type CreateSimulatedProjectInput = {
  name: string;                 // project_name
  researchQuestion?: string;    // falls back to a topic-derived default
  label?: string | null;        // the creator's private label, e.g. "Heineken pitch"
  scenarioTemplateId?: string | null;
  config: SimulationSourceConfig;
  actor: string;                // session.workEmail
};

export type CreateSimulatedProjectResult = {
  projectId: string;            // research_projects.id
  evidenceSimulationId: string;
  campaignId: string | null;    // campaigns.campaign_id (text slug)
  surveyId: string | null;
  searchId: string | null;
};

export async function createSimulatedProject(input: CreateSimulatedProjectInput): Promise<CreateSimulatedProjectResult> {
  const { config } = input;
  const slugBase = toSlugPart(input.name) || "demo";
  const suffix = shortId();

  const { data: project, error: projectErr } = await supabaseAdmin
    .from("research_projects")
    .insert({
      project_id: `sim-${slugBase}-${suffix}`,
      project_name: input.name,
      research_mode: "simulated",
      research_question: input.researchQuestion?.trim() || `Understand fan sentiment toward ${config.topic}.`,
      study_type: "custom",
      topic: config.topic,
      created_by: input.actor,
      created_by_admin: false, // irrelevant for simulated projects — see GET /api/research-projects' visibility branch
    })
    .select("id")
    .single();
  if (projectErr || !project) throw new Error(`Failed to create simulated project: ${projectErr?.message}`);

  const { data: evidenceSim, error: esErr } = await supabaseAdmin
    .from("evidence_simulations")
    .insert({
      research_project_id: project.id,
      scenario_template_id: input.scenarioTemplateId ?? null,
      label: input.label ?? null,
      source_config: config,
      markets: config.markets,
      status: "generating",
    })
    .select("id")
    .single();
  if (esErr || !evidenceSim) throw new Error(`Failed to create evidence_simulations row: ${esErr?.message}`);

  let campaignId: string | null = null;
  let surveyId: string | null = null;
  let searchId: string | null = null;

  if (config.sources.includes("survey")) {
    const { data: survey, error: surveyErr } = await supabaseAdmin
      .from("surveys")
      .insert({
        name: `${input.name}, Simulated Survey`,
        status: "ready",
        questions: DEFAULT_SIMULATED_SURVEY_QUESTIONS,
        is_simulated: true,
        created_by: input.actor,
      })
      .select("id")
      .single();
    if (surveyErr || !survey) throw new Error(`Failed to create simulated survey: ${surveyErr?.message}`);
    surveyId = survey.id;

    const { data: campaign, error: campaignErr } = await supabaseAdmin
      .from("campaigns")
      .insert({
        campaign_id: `sim-${slugBase}-${suffix}`,
        campaign_name: `${input.name}, Simulated Deployment`,
        research_project_id: project.id,
        survey_id: survey.id,
        is_simulated: true,
        status: "live",
        study_type: "custom",
        created_by_admin: false,
      })
      .select("campaign_id")
      .single();
    if (campaignErr || !campaign) throw new Error(`Failed to create simulated campaign: ${campaignErr?.message}`);
    campaignId = campaign.campaign_id;

    await supabaseAdmin.from("research_project_evidence").insert({
      research_project_id: project.id, evidence_type: "survey", evidence_id: survey.id,
      is_simulated: true, added_by: input.actor,
    });
    await supabaseAdmin.from("research_projects").update({ survey_id: survey.id }).eq("id", project.id);
  }

  if (config.sources.includes("conversation_search")) {
    const { data: search, error: searchErr } = await supabaseAdmin
      .from("social_searches")
      .insert({
        name: `${input.name}, Simulated Conversation Search`,
        markets: config.markets,
        is_simulated: true,
      })
      .select("id")
      .single();
    if (searchErr || !search) throw new Error(`Failed to create simulated search: ${searchErr?.message}`);
    searchId = search.id;

    await supabaseAdmin.from("research_project_evidence").insert({
      research_project_id: project.id, evidence_type: "social_search", evidence_id: search.id,
      is_simulated: true, added_by: input.actor,
    });
  }

  await logActivity(project.id, "simulated_project_created", `Product Walkthrough "${input.name}" created.`, input.actor);

  return { projectId: project.id, evidenceSimulationId: evidenceSim.id, campaignId, surveyId, searchId };
}

export type CreateEmptySimulatedProjectInput = {
  name: string;                   // project_name (Walkthrough Name — used directly, no derived-name scheme)
  researchQuestion?: string | null;
  clientLabel?: string | null;    // "Client/Prospect" — sales/organisational metadata, never shown to a prospect
  internalNotes?: string | null;
  actor: string;
};

// The Library's *only* creation path going forward: a bare container, no
// survey, no campaign, no search, no evidence_simulations row, no
// generation triggered. Everything about what a walkthrough contains gets
// built inside the workspace itself (WorkspaceBody), step by step — that's
// the experience being demonstrated, not something the Library front-loads.
export async function createEmptySimulatedProject(input: CreateEmptySimulatedProjectInput): Promise<{ projectId: string }> {
  const slugBase = toSlugPart(input.name) || "walkthrough";
  const suffix = shortId();

  const { data: project, error } = await supabaseAdmin
    .from("research_projects")
    .insert({
      project_id: `sim-${slugBase}-${suffix}`,
      project_name: input.name,
      research_mode: "simulated",
      research_question: input.researchQuestion?.trim() || null,
      client_label: input.clientLabel?.trim() || null,
      internal_notes: input.internalNotes?.trim() || null,
      study_type: "custom",
      created_by: input.actor,
      created_by_admin: false,
    })
    .select("id")
    .single();
  if (error || !project) throw new Error(`Failed to create Product Walkthrough: ${error?.message}`);

  await logActivity(project.id, "simulated_project_created", `Product Walkthrough "${input.name}" created.`, input.actor);

  return { projectId: project.id };
}
