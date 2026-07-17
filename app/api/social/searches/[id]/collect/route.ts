// Unified live collection endpoint for one social_search. Runs every connector
// the search has enabled (or an explicit subset) through the shared pipeline,
// recording the run as a timestamped snapshot in collection_runs and storing all
// collected + classified items in social_mentions. Admin-triggered only — no
// cron. Supersedes the Reddit-specific collect-reddit route (that connector now
// runs through this same path).
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { runCollection } from "@/lib/collection/run-collection";

// Collection fans out to external APIs and inline classification; give it room.
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const connectorIds: string[] | undefined = Array.isArray(body?.connectors)
    ? body.connectors.filter((x: unknown) => typeof x === "string")
    : undefined;

  try {
    const result = await runCollection({ searchId: id, connectorIds, triggeredBy: session.workEmail });
    const httpStatus = result.status === "failed" ? 502 : 200;
    return NextResponse.json(result, { status: httpStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Collection failed";
    const status = message.includes("not found") ? 404 : message.includes("simulated") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
