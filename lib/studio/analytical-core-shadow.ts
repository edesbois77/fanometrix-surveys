// ── Survey Studio → Analytical Core shadow enqueue (Stage 5C) ─────────────────
// The ISOLATED bridge from the authoritative Studio analysis path to the shadow
// job. Dependency-light: it imports ONLY the job enqueuer + the job-type constant —
// NEVER the Analytical Core internals (Studio must not depend on Core analytical
// logic; the handler owns that). Flag-gated (default OFF) and BULLETPROOF: it never
// throws and never blocks, so a shadow trigger can never affect the authoritative
// Studio analysis or its HTTP response.

import { enqueueJob } from "@/lib/jobs/enqueue";
import { ANALYTICAL_CORE_SHADOW_JOB, type CoreShadowSourceKind } from "@/lib/jobs/handlers/analytical-core-shadow.constants";

/** Shadow is OFF unless ANALYTICAL_CORE_SHADOW_ENABLED is "true"/"1". */
export function coreShadowEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.ANALYTICAL_CORE_SHADOW_ENABLED;
  return v === "true" || v === "1";
}

/** Fire-and-forget: enqueue a shadow Core run for an authoritative analysis run.
 *  When the flag is off/absent this is a no-op. It NEVER throws — any enqueue
 *  failure is swallowed so the caller (the authoritative Studio path) is unaffected.
 *  Dedupe on the run id makes a double trigger / job retry idempotent. */
export async function enqueueCoreShadow(
  args: { sourceKind: CoreShadowSourceKind; analysisRunId: string },
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  if (!coreShadowEnabled(env)) return;
  try {
    await enqueueJob({
      type: ANALYTICAL_CORE_SHADOW_JOB,
      payload: { source_kind: args.sourceKind, analysis_run_id: args.analysisRunId },
      dedupeKey: `${ANALYTICAL_CORE_SHADOW_JOB}:${args.sourceKind}:${args.analysisRunId}`,
    });
  } catch {
    // Shadow is observational only — a failure to enqueue must never surface.
  }
}
