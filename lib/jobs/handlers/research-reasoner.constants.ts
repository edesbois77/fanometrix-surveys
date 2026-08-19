// Shared so the enqueuer and the handler agree on the job type without the enqueuer
// importing the handler's heavy dependencies (the reasoning stack + OpenAI).
export const RESEARCH_REASONER_JOB = "research.reasoner";

/** Source of an authoritative Studio analysis run the reasoner analyses. Only 'survey'
 *  for the first gated integration. */
export type ResearchReasonerSourceKind = "survey";
