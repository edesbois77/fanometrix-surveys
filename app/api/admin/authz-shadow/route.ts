import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { shadowStats } from "@/lib/authz/shadow";

// ORG-005 · IW-0 — admin-only diagnostic reporting this serverless instance's
// authorisation shadow-comparison counters (evaluated / divergent). Counters
// are per-instance and in-memory; a durable aggregate is a separate later
// decision. Protected (admin-only) — a diagnostic surface, never public
// (preserves F069). Returns no identity, resource ids, or secrets.
export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }
  return NextResponse.json({ scope: "per-instance", ...shadowStats() });
}
