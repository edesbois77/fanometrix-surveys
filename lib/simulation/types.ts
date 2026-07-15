import type { TonePreset } from "@/lib/simulation/tone-presets";

/** The one input contract both creation paths (Launch a Scenario's
 * templates and Build a Custom Demo's wizard) produce — see migration
 * 082's header comment. Kept in one place so the generation engine
 * never needs to know which path a config came from. */
export type SimulationSourceConfig = {
  sources: ("survey" | "conversation_search")[];
  topic: string;
  tone_preset: TonePreset;
  markets: string[];
  survey_response_target: number;
  mention_target: number;
};
