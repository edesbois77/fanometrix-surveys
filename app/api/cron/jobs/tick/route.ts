// The durable worker. Triggered every minute by Supabase pg_cron via pg_net
// (see supabase-migration-130.sql §5) — the heartbeat that makes background work
// resilient to Vercel instance termination and to a dead after() fast-path. It
// drains the generic job queue: any registered job type, not just documents.
//
// This is the ONLY thing guaranteeing a document never stays stuck at "Queued":
// even if the upload's after() trigger never runs, the enqueued job sits in the
// queue until a tick claims and completes it.
import { NextRequest, NextResponse } from "next/server";
import { drainJobs } from "@/lib/jobs/worker";
import { TICK_BUDGET_MS } from "@/lib/jobs/config";
import { isCronAuthorized } from "@/lib/jobs/cron-auth";

// The drain runs synchronously within the request (not after()) — pg_net fired
// it as a fire-and-forget POST, so the invocation must stay alive for the whole
// drain. A single long job can take minutes; give it the full window.
export const maxDuration = 300;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // This route is excluded from the session-auth middleware (see middleware.ts's
  // PUBLIC_API_PREFIXES) precisely so it can enforce its OWN bearer check here.
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Register all handlers before draining so getHandler() resolves every type.
  await import("@/lib/jobs/handlers");

  const workerId = `cron-${Date.now()}`;
  try {
    const summary = await drainJobs({ workerId, budgetMs: TICK_BUDGET_MS });
    return NextResponse.json({ ok: true, worker: workerId, ...summary });
  } catch (err) {
    console.error("[cron/jobs/tick] drain failed", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "drain failed" }, { status: 500 });
  }
}

// Some cron pingers issue GET. Accept it identically so setup is forgiving.
export async function GET(req: NextRequest) {
  return POST(req);
}
