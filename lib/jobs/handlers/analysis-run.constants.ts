// Shared so the enqueuer and the handler agree on the job type without the
// enqueuer importing the handler's heavy dependencies.
export const ANALYSIS_RUN_JOB = "analysis.run";

/** The model the reasoning pipeline runs on, recorded on every finding. */
export const ANALYSIS_MODEL = "gpt-4o";
