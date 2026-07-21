// Admin retry for any failed / requires_review job. Re-queues the job via the
// framework's generic retryJob, then best-effort kicks a drain so it starts
// promptly; pg_cron would pick it up regardless.
import { NextRequest, NextResponse, after } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { retryJob } from "@/lib/jobs/retry";

export const maxDuration = 300;
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const result = await retryJob(id);

  if (!result.ok) {
    const status =
      result.reason === "not_found" ? 404
      : result.reason === "not_terminal" ? 409
      : result.reason === "duplicate_active" ? 409
      : 500;
    const message =
      result.reason === "not_found" ? "Job not found."
      : result.reason === "not_terminal" ? "Only failed or needs-review jobs can be retried."
      : result.reason === "duplicate_active" ? "This work is already queued or running."
      : result.reason ?? "Couldn't retry the job.";
    return NextResponse.json({ error: message }, { status });
  }

  // Best-effort low-latency kick; the pg_cron worker is the guarantee.
  after(async () => {
    try {
      await import("@/lib/jobs/handlers");
      const { drainJobs } = await import("@/lib/jobs/worker");
      await drainJobs({ workerId: `retry-${id}`, budgetMs: 290_000 });
    } catch (err) {
      console.error("[background-jobs retry] drain failed", err);
    }
  });

  return NextResponse.json({ data: { status: "queued" } });
}
