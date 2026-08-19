// ── Research Intelligence enqueue — the STANDARD fresh-research lifecycle hook ─
// The ISOLATED bridge from an authoritative analysis completion to the async reasoning
// job. Dependency-light: imports ONLY the job enqueuer + the job-type constant + the
// GENERATION gate — NEVER the reasoning stack or OpenAI (the handler owns those). It is
// BULLETPROOF: it never throws and never blocks, so a reasoning trigger can never affect
// the authoritative analysis or its HTTP response.
//
// GENERATION vs EXPOSURE: this gates on `researchIntelligenceGenerationEnabled` (a distinct
// generation kill-switch, default ON) — NOT on the display flag. Fresh research is reasoned
// automatically regardless of who can currently see it; we never fail to GENERATE merely
// because the result is not yet exposed.
//
// IDEMPOTENCY: the dedupe key is the EVIDENCE FINGERPRINT (not the run id), matching the
// Stage-A fingerprint identity. At most one LIVE job may share a dedupe key, so two
// re-analyses producing the SAME evidence whose jobs overlap collapse to ONE job — closing
// the concurrent same-fingerprint model-cost race with the existing dedupe mechanism. A
// sequential re-run (previous job already finished) enqueues a fresh job, which the handler
// then SKIPS on the fingerprint (0 model calls). The domain table's unique identity index
// remains the final concurrency boundary either way.
import { enqueueJob } from "@/lib/jobs/enqueue";
import { researchIntelligenceGenerationEnabled } from "@/lib/research-intelligence/read";
import { RESEARCH_REASONER_JOB, type ResearchReasonerSourceKind } from "@/lib/jobs/handlers/research-reasoner.constants";

/** Fire-and-forget: enqueue a reasoning run for an authoritative analysis run. A no-op when
 *  generation is switched off. It NEVER throws. `evidenceFingerprint` (the run's
 *  evidence_hash) is used as the dedupe identity when present; it falls back to the run id
 *  only if a caller cannot supply it (a completed run always has a fingerprint). */
export async function enqueueResearchReasoner(
  args: { sourceKind: ResearchReasonerSourceKind; analysisRunId: string; evidenceFingerprint?: string | null },
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  if (!researchIntelligenceGenerationEnabled(env)) return;
  const dedupeIdentity = args.evidenceFingerprint || args.analysisRunId;
  try {
    await enqueueJob({
      type: RESEARCH_REASONER_JOB,
      payload: { source_kind: args.sourceKind, analysis_run_id: args.analysisRunId },
      dedupeKey: `${RESEARCH_REASONER_JOB}:${args.sourceKind}:${dedupeIdentity}`,
    });
  } catch {
    // Reasoning is a subordinate enhancement — a failure to enqueue must never surface.
  }
}
