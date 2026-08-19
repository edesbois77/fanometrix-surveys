export {
  validateGroupingStructure, FixtureGroupingProposer, verdictToProposal,
  type StructuralResult, type YNU, type Ambiguity,
  type GroupingProposalInput, type GroupingProposal, type SemanticGroupingProposer,
  // legacy, eval-only (real-model adapter + its prompt/validator):
  type GroupingJudgeInput, type GroupingVerdict,
} from "./grouping";
export {
  validateSynthesis, validateSynthesisClaim, buildSynthesisCandidate, FixtureSynthesisProposer, synthesisVerdictToSignal,
  type SynthesisProposal, type SynthesisSignal, type SemanticSynthesisProposer, type SynthesisClaimType,
  type SynthesisVerdict, // legacy, eval-only
} from "./synthesis";
export { RUBRIC_VERSIONS, buildGroupingPrompt, buildSynthesisPrompt, buildDisconfirmationPrompt } from "./prompts";
export { validateGroupingResponse, validateSynthesisResponse, validateDisconfirmationResponse, type Validated } from "./validate-model-output";

