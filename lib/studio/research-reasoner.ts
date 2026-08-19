// ── Survey Studio → Research Reasoner enqueue (gated integration) ────────────
// The ISOLATED bridge from the authoritative Studio analysis path to the async
// reasoning job. Dependency-light: imports ONLY the job enqueuer + the job-type constant
// + the flag — NEVER the reasoning stack or OpenAI (the handler owns those). Flag-gated
// (default OFF) and BULLETPROOF: it never throws and never blocks, so a reasoning trigger
// can never affect the authoritative Studio analysis or its HTTP response. Dedupe on the
// run id makes a double trigger / retry idempotent, and (with the domain table's unique
// key) means opening Findings never enqueues.
import { enqueueJob } from "@/lib/jobs/enqueue";
import { researchReasonerEnabled } from "@/lib/studio/research-intelligence";
import { RESEARCH_REASONER_JOB, type ResearchReasonerSourceKind } from "@/lib/jobs/handlers/research-reasoner.constants";

/** Fire-and-forget: enqueue a reasoning run for an authoritative analysis run. When the
 *  flag is off/absent this is a no-op. It NEVER throws. */
export async function enqueueResearchReasoner(
  args: { sourceKind: ResearchReasonerSourceKind; analysisRunId: string },
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  if (!researchReasonerEnabled(env)) return;
  try {
    await enqueueJob({
      type: RESEARCH_REASONER_JOB,
      payload: { source_kind: args.sourceKind, analysis_run_id: args.analysisRunId },
      dedupeKey: `${RESEARCH_REASONER_JOB}:${args.sourceKind}:${args.analysisRunId}`,
    });
  } catch {
    // Reasoning is a subordinate enhancement — a failure to enqueue must never surface.
  }
}
