// ── Fanometrix Analytical Core — shadow orchestrator (Stage 5C) ───────────────
// Runs the Core in SHADOW over Studio governed results. Feature-flagged (default
// OFF) and FAILURE-ISOLATED: it never throws and never affects the caller. It
// produces an AnalyticalRun for evaluation only — it returns no user-facing
// output and is NOT wired into production (see README for the deferred hook).

import { runAnalysis, type PipelineOptions } from "../pipeline/analyse";
import { buildRun } from "../run/ledger";
import type { AnalyticalRun, VersionSet } from "../run/types";
import { STANDARD_VERSION, CORE_VERSION } from "../version";
import { RUBRIC_VERSIONS } from "../semantic/prompts";
import { studioToDiscoveryInput, type StudioGovernedInput } from "./adapter";

export const PIPELINE_VERSION = "core-pipeline-v1";

/** Shadow is OFF unless ANALYTICAL_CORE_SHADOW_ENABLED is "true"/"1". */
export function shadowEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.ANALYTICAL_CORE_SHADOW_ENABLED;
  return v === "true" || v === "1";
}

export function coreVersions(): VersionSet {
  return { standardVersion: STANDARD_VERSION, coreVersion: CORE_VERSION, pipelineVersion: PIPELINE_VERSION, semanticRubricVersions: { ...RUBRIC_VERSIONS } };
}

export type ShadowResult = { status: "skipped" | "completed" | "failed"; run?: AnalyticalRun; error?: string };

/** Run the Core in shadow. NEVER throws. Returns skipped when the flag is off.
 *  Pass resolved semantic judges (built from real-model verdicts upstream) via
 *  opts.pipeline; without them, groupings simply stay held. */
export function runStudioShadow(
  input: StudioGovernedInput,
  meta: { runId: string; startedAt: string; completedAt: string },
  opts: { pipeline?: PipelineOptions; env?: Record<string, string | undefined> } = {},
): ShadowResult {
  if (!shadowEnabled(opts.env)) return { status: "skipped" };
  try {
    const discovery = studioToDiscoveryInput(input);
    const result = runAnalysis(discovery, opts.pipeline);
    const run = buildRun({
      id: meta.runId, source: input.source, versions: coreVersions(),
      startedAt: meta.startedAt, completedAt: meta.completedAt, status: "completed",
      input: discovery, result,
    });
    return { status: "completed", run };
  } catch (e) {
    // Failure is isolated — the caller (production Studio path) is unaffected.
    return { status: "failed", error: String(e).slice(0, 300) };
  }
}
