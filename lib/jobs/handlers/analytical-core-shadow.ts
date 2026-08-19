// ── Analytical Core shadow run, through the job framework (Stage 5C) ──────────
// One job = one shadow Core execution mirroring ONE authoritative Studio analysis
// run. It re-reads that run's IMMUTABLE evidence_snapshot (never live results),
// runs the Core, and writes a SEPARATE analytical_core_shadow_runs artefact. It
// writes NO authoritative table, produces NO user-facing output, and is invisible
// to Studio/Discover/reports. Heavy deps are lazy-imported so registering this
// handler never loads the Core.
//
// The Core runs DETERMINISTICALLY here (no semantic-model proposers): current
// Studio evidence declares no governed semantic metadata, so every grouping is
// entailment-unable and would only become PROVISIONAL from a model proposal — a
// model-augmented shadow is a later, separately-authorised enhancement. This first
// shadow captures descriptive findings, governance, selectivity, synthesis/
// disconfirmation structure, provenance and operational behaviour.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { registerHandler } from "@/lib/jobs/registry";
import { PermanentJobError, type JobContext } from "@/lib/jobs/types";
import { ANALYTICAL_CORE_SHADOW_JOB, type CoreShadowSourceKind } from "@/lib/jobs/handlers/analytical-core-shadow.constants";

function str(payload: Record<string, unknown>, key: string): string {
  const v = payload[key];
  if (typeof v !== "string" || !v) throw new PermanentJobError(`${ANALYTICAL_CORE_SHADOW_JOB} job is missing string '${key}'`);
  return v;
}

const RUN_TABLE: Record<CoreShadowSourceKind, string> = { study: "study_analysis_runs", survey: "survey_analysis_runs" };
const SOURCE_COL: Record<CoreShadowSourceKind, string> = { study: "study_id", survey: "survey_id" };

async function run(ctx: JobContext): Promise<void> {
  const analysisRunId = str(ctx.payload, "analysis_run_id");
  const sourceKind = str(ctx.payload, "source_kind") as CoreShadowSourceKind;
  if (sourceKind !== "study" && sourceKind !== "survey") throw new PermanentJobError(`Unknown source_kind '${sourceKind}'`);

  // Resolve the AUTHORITATIVE run from trusted stored records (never the payload)
  // — this fixes source/tenant identity from the run row, not the caller.
  const { data: runRow, error } = await supabaseAdmin
    .from(RUN_TABLE[sourceKind]).select("*").eq("id", analysisRunId).single();
  if (error || !runRow) throw new PermanentJobError(`Authoritative ${sourceKind} run ${analysisRunId} not found`);
  const sourceId = (runRow as Record<string, unknown>)[SOURCE_COL[sourceKind]] as string;
  const snapshot = (runRow as Record<string, unknown>).evidence_snapshot as { study?: { id?: string; objective?: string | null }; evidence?: unknown[] } | null;
  if (!snapshot || !Array.isArray(snapshot.evidence)) throw new PermanentJobError(`Run ${analysisRunId} has no usable evidence_snapshot`);

  // Lazy-load the Core only when a job actually runs.
  const { studioEvidenceToGovernedInput } = await import("@/lib/core/studio/studio-evidence-adapter");
  const { runStudioShadow } = await import("@/lib/core/studio/shadow");

  const governed = studioEvidenceToGovernedInput(snapshot as never, { kind: sourceKind, id: sourceId });
  await ctx.heartbeat();
  const now = new Date().toISOString();
  // Force-enable for the worker path: the enqueue gate already decided this runs.
  const shadow = runStudioShadow(governed, { runId: `${analysisRunId}:shadow`, startedAt: now, completedAt: new Date().toISOString() }, { env: { ANALYTICAL_CORE_SHADOW_ENABLED: "true" } });

  // Persist to the SEPARATE shadow domain table (never an authoritative table).
  const { error: writeErr } = await supabaseAdmin.from("analytical_core_shadow_runs").upsert({
    source_kind: sourceKind, source_id: sourceId, analysis_run_id: analysisRunId,
    input_fingerprint: shadow.run?.inputFingerprint ?? null,
    versions: shadow.run?.versions ?? {},
    status: shadow.status, run: shadow.run ?? null, error: shadow.error ?? null,
    completed_at: new Date().toISOString(),
  }, { onConflict: "analysis_run_id" });
  if (writeErr) throw new Error(`shadow persist failed: ${writeErr.message}`); // transient → retried
  ctx.log(`Shadow Core run for ${sourceKind} ${sourceId} (auth run ${analysisRunId}): ${shadow.status}.`);
}

registerHandler(ANALYTICAL_CORE_SHADOW_JOB, { run });
