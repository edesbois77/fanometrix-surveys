// Shared so the enqueuer and the handler agree on the job type without the enqueuer
// importing the handler's heavy dependencies (the reasoning stack + OpenAI).
export const RESEARCH_REASONER_JOB = "research.reasoner";

/** Source of an authoritative Studio analysis run the reasoner analyses. 'survey' (Stage A/B)
 *  and 'study' (Stage C1) are wired; 'report'/'comparison' remain reserved. */
export type ResearchReasonerSourceKind = "survey" | "study";
