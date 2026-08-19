// Shared so the enqueuer and the handler agree on the job type without the
// enqueuer importing the handler's heavy dependencies (the Analytical Core).
export const ANALYTICAL_CORE_SHADOW_JOB = "analytical-core.shadow";

/** Source of an authoritative Studio analysis run the shadow mirrors. */
export type CoreShadowSourceKind = "study" | "survey";
