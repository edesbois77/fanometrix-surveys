// The durable worker. Triggered every minute by Supabase pg_cron via pg_net
// (see supabase-migration-130.sql §5) — the heartbeat that makes background work
// resilient to Vercel instance termination and to a dead after() fast-path. It
// drains the generic job queue: any registered job type, not just documents.
//
// This is the ONLY thing guaranteeing a document never stays stuck at "Queued":
// even if the upload's after() trigger never runs, the enqueued job sits in the
// queue until a tick claims and completes it.
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { drainJobs } from "@/lib/jobs/worker";
import { TICK_BUDGET_MS } from "@/lib/jobs/config";
import { isCronAuthorized } from "@/lib/jobs/cron-auth";

// The drain runs synchronously within the request (not after()) — pg_net fired
// it as a fire-and-forget POST, so the invocation must stay alive for the whole
// drain. A single long job can take minutes; give it the full window.
export const maxDuration = 300;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TEMPORARY diagnostic — remove after the CRON_SECRET mismatch is resolved.
// Logs md5 fingerprints (non-reversible) and lengths so the env side, the
// received-header side and the Vault side can be compared WITHOUT ever logging
// the secret. Compare these values with supabase-migration §diagnostic SQL.
function fp(s: string | null | undefined): string {
  return s ? createHash("md5").update(s).digest("hex").slice(0, 8) : "none";
}

export async function POST(req: NextRequest) {
  // This route is excluded from the session-auth middleware (see middleware.ts's
  // PUBLIC_API_PREFIXES) precisely so it can enforce its OWN bearer check here.
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  const authorized = isCronAuthorized(authHeader, secret);

  // TEMPORARY diagnostic block — remove after diagnosis. No secret is logged.
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  console.warn("[cron-auth-debug] " + JSON.stringify({
    hasSecret: !!secret,
    secretLen: secret?.length ?? 0,
    hasHeader: !!authHeader,
    headerLen: authHeader?.length ?? 0,
    startsWithBearer: authHeader?.startsWith("Bearer ") ?? false,
    secretFp: fp(secret),                     // md5(env CRON_SECRET)
    tokenFp: fp(token),                       // md5(received token after "Bearer ")
    headerFp: fp(authHeader),                 // md5(full received Authorization value)
    expectedHeaderFp: fp(secret ? `Bearer ${secret}` : null), // md5("Bearer " + env secret)
    match: authorized,
  }));

  if (!authorized) {
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
