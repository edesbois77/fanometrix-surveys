// Run Analysis, through the job framework.
//
// The reasoning pipeline is expensive and makes many model calls, so it never
// runs inline in a request (the standing rule: all async work goes through the
// jobs framework). The 'analysis.run' job (payload { analysis_run_id }) is the
// OPERATIONAL record of how the run executes; analysis_runs is the domain record
// of what the run is and where it got to. The handler drives the pipeline and
// reflects the framework's terminal decision onto analysis_runs via onOutcome.
//
// IDEMPOTENT by construction. persistRun supersedes the previous run's
// unadjudicated candidates and leaves anything a person approved or rejected
// alone, so a retry after a crash re-reasons and re-supersedes without ever
// destroying adjudicated work or leaving two live candidate sets for a question.
// heartbeat() is called around the two slow phases so a sweeper does not reclaim
// a live run.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { registerHandler } from "@/lib/jobs/registry";
import { PermanentJobError, type JobContext, type JobOutcome, type JobRow } from "@/lib/jobs/types";
import { ANALYSIS_RUN_JOB, ANALYSIS_MODEL } from "@/lib/jobs/handlers/analysis-run.constants";

function analysisRunId(payload: Record<string, unknown>): string {
  const id = payload.analysis_run_id;
  if (typeof id !== "string" || !id) {
    throw new PermanentJobError("analysis.run job is missing a string 'analysis_run_id'");
  }
  return id;
}

async function run(ctx: JobContext): Promise<void> {
  const runId = analysisRunId(ctx.payload);

  const { data: runRow, error } = await supabaseAdmin
    .from("analysis_runs")
    .select("id, research_project_id, status")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new Error(`Could not load analysis run ${runId}: ${error.message}`); // transient
  if (!runRow) throw new PermanentJobError(`Analysis run ${runId} no longer exists`);
  if (runRow.status === "completed") return; // already done — nothing to do

  const projectId = runRow.research_project_id as string;

  await supabaseAdmin
    .from("analysis_runs")
    .update({ status: "running", started_at: new Date().toISOString(), error: null })
    .eq("id", runId);

  // Lazy-import the pipeline so merely REGISTERING this handler never loads the
  // reasoning stack. Any failure to load or execute it is caught by the
  // framework as a normal job error.
  const { reasonOverProject } = await import("@/lib/analysis/reason");
  const { persistRun } = await import("@/lib/analysis/finding-store");

  ctx.log(`Reasoning over project ${projectId}`);
  const reasoning = await reasonOverProject(projectId);
  await ctx.heartbeat();

  const persisted = await persistRun(reasoning, { model: ANALYSIS_MODEL, runId });
  await ctx.heartbeat();

  await supabaseAdmin
    .from("analysis_runs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      needs_reasoned: reasoning.results.length,
      findings_written: persisted.written,
      candidates_written: persisted.candidates,
      superseded: persisted.superseded,
      coverage: reasoning.coverage,
      unexamined: reasoning.unexamined,
      unmapped: reasoning.unmapped,
    })
    .eq("id", runId);

  ctx.log(`Wrote ${persisted.candidates} candidate findings across ${reasoning.results.length} questions`);
}

/** Reflect the framework's terminal decision onto the domain table. On a
 *  transient retry the row stays 'running' so the surface keeps showing progress;
 *  only a genuine terminal marks it failed. */
async function onOutcome(outcome: JobOutcome, job: JobRow): Promise<void> {
  const runId = typeof job.payload.analysis_run_id === "string" ? job.payload.analysis_run_id : null;
  if (!runId) return;
  if (outcome === "failed" || outcome === "requires_review") {
    await supabaseAdmin
      .from("analysis_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error: job.last_error ?? "The analysis could not be completed.",
      })
      .eq("id", runId)
      .neq("status", "completed");
  }
}

registerHandler(ANALYSIS_RUN_JOB, { run, onOutcome });
