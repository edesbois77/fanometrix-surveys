// Orchestrates one evidence_simulations run: calls whichever generators
// its source_config asks for, then flips status to ready|failed. Used
// by both the creation flow (Phase 6, fired via next/server's after())
// and the Reset endpoint (which re-runs this against the same
// evidence_simulation_id after clearing its prior evidence).
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logActivity } from "@/lib/research-project-activity";
import { generateSurveyResponses } from "@/lib/simulation/generate-survey-responses";
import { generateConversationMentions } from "@/lib/simulation/generate-conversation-mentions";
import type { SimulationSourceConfig } from "@/lib/simulation/types";

export type RunSimulationGenerationInput = {
  researchProjectId: string;
  evidenceSimulationId: string;
  config: SimulationSourceConfig;
  campaignId: string | null;   // campaigns.campaign_id (text slug) — required if config.sources includes "survey"
  surveyId: string | null;     // surveys.id — required if config.sources includes "survey"
  searchId: string | null;     // social_searches.id — required if config.sources includes "conversation_search"
  actor?: string | null;
};

export async function runSimulationGeneration(input: RunSimulationGenerationInput): Promise<void> {
  const { researchProjectId, evidenceSimulationId, config, actor } = input;

  // Each requested source is generated independently — one source
  // throwing (e.g. conversation generation hitting a missing
  // OPENAI_API_KEY) must never discard evidence a different, unrelated
  // generator already wrote. A prior all-or-nothing try/catch here
  // meant a demo with 600 real survey responses and a genuinely broken
  // conversation source still showed as a flat "Failed" — indistinguishable
  // from a demo with nothing in it at all. Status now reflects
  // "is there anything here to present," not "did every requested
  // source complete."
  const succeeded: string[] = [];
  const failed: string[] = [];

  if (config.sources.includes("survey")) {
    try {
      if (!input.campaignId || !input.surveyId) throw new Error("Survey generation requested but no campaign/survey provided");
      const { inserted } = await generateSurveyResponses({
        campaignId: input.campaignId, surveyId: input.surveyId, evidenceSimulationId,
        count: config.survey_response_target, tonePreset: config.tone_preset, markets: config.markets,
      });
      succeeded.push(`${inserted} survey responses`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[simulation] survey generation failed:", message);
      failed.push(`survey responses (${message})`);
    }
  }

  if (config.sources.includes("conversation_search")) {
    try {
      if (!input.searchId) throw new Error("Conversation generation requested but no search provided");
      const { inserted } = await generateConversationMentions({
        searchId: input.searchId, evidenceSimulationId, count: config.mention_target,
        tonePreset: config.tone_preset, topic: config.topic, markets: config.markets,
      });
      succeeded.push(`${inserted} conversation mentions`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[simulation] conversation generation failed:", message);
      failed.push(`conversation mentions (${message})`);
    }
  }

  // "Ready" means presentable — at least one requested source produced
  // real evidence. Only a source that produced nothing at all is
  // "failed," matching what a demo with zero usable evidence actually is.
  const status = succeeded.length > 0 ? "ready" : "failed";
  await supabaseAdmin.from("evidence_simulations")
    .update({ status, generated_at: status === "ready" ? new Date().toISOString() : null })
    .eq("id", evidenceSimulationId);

  const parts = [
    succeeded.length > 0 ? `Generated ${succeeded.join(" and ")}.` : null,
    failed.length > 0 ? `Failed: ${failed.join("; ")}.` : null,
  ].filter(Boolean);
  await logActivity(researchProjectId, "simulation_evidence_generated", parts.join(" "), actor);
}
