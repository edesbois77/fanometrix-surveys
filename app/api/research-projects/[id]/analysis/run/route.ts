// Run Analysis. POST starts a reasoning run through the jobs framework; GET
// polls the latest run. Never runs the pipeline inline: the route enqueues and
// returns immediately, and the surface polls GET until the run completes.
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { startAnalysisRun, latestRun } from "@/lib/analysis/run-analysis";
import { ANALYSIS_RUN_JOB } from "@/lib/jobs/handlers/analysis-run.constants";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  return NextResponse.json({ data: await latestRun(id) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;

  const result = await startAnalysisRun(id, session.workEmail);

  // Best-effort low-latency kick; pg_cron drains the queue if this does not run.
  if (result.started) {
    after(async () => {
      try {
        await import("@/lib/jobs/handlers");
        const { drainJobs } = await import("@/lib/jobs/worker");
        await drainJobs({ workerId: `analysis-${result.run.id}`, types: [ANALYSIS_RUN_JOB], budgetMs: 290_000 });
      } catch (err) {
        console.error("[analysis.run] drain failed", err);
      }
    });
  }

  return NextResponse.json({ data: result.run, started: result.started });
}
