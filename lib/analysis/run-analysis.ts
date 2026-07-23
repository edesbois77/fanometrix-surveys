// Starting and reading a Run Analysis. The route calls startAnalysisRun to
// enqueue the work and latestRun to poll it. Kept apart from the handler so a
// route enqueuing a run never loads the reasoning stack.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { ANALYSIS_RUN_JOB } from "@/lib/jobs/handlers/analysis-run.constants";

export type AnalysisRun = {
  id: string;
  research_project_id: string;
  status: "queued" | "running" | "completed" | "failed";
  needs_reasoned: number;
  findings_written: number;
  candidates_written: number;
  superseded: number;
  coverage: Record<string, unknown> | null;
  unexamined: unknown[];
  unmapped: unknown[];
  model: string | null;
  requested_by: string | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type StartResult =
  | { started: true; run: AnalysisRun }
  | { started: false; run: AnalysisRun; reason: "already_running" };

/** Enqueue a reasoning run for a project.
 *
 *  At most one live run per project: the active-run unique index (migration 144)
 *  makes a second request while one is in flight a no-op that returns the run
 *  already going, rather than a duplicate. The reasoning is expensive and there
 *  is nothing to gain from two racing to supersede each other's candidates. */
export async function startAnalysisRun(projectId: string, requestedBy: string): Promise<StartResult> {
  const { data: created, error } = await supabaseAdmin
    .from("analysis_runs")
    .insert({ research_project_id: projectId, status: "queued", requested_by: requestedBy })
    .select("*")
    .maybeSingle();

  // 23505 = the active-run unique index: a run is already queued or running.
  if (error) {
    if (error.code === "23505") {
      const existing = await latestRun(projectId);
      if (existing) return { started: false, run: existing, reason: "already_running" };
    }
    throw new Error(error.message);
  }

  const run = created as AnalysisRun;
  await enqueueJob({
    type: ANALYSIS_RUN_JOB,
    payload: { analysis_run_id: run.id },
    // One live job per run row; the run row already enforces one live run per
    // project, so this simply prevents a double-enqueue of the same run.
    dedupeKey: `analysis.run:${run.id}`,
  });

  return { started: true, run };
}

/** The most recent run for a project, whatever its state. What the surface polls. */
export async function latestRun(projectId: string): Promise<AnalysisRun | null> {
  const { data } = await supabaseAdmin
    .from("analysis_runs")
    .select("*")
    .eq("research_project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as AnalysisRun | null) ?? null;
}
