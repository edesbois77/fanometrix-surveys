// Admin → Background Jobs. Read-only operational view over the generic job
// framework (lib/jobs): per-status counts for the summary tiles plus a filtered
// list of jobs with the execution metadata an operator needs to diagnose a stuck
// or failing feature (attempts, runtime, last error). Admin-only.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";

const ALL_STATUSES = ["queued", "running", "failed", "requires_review", "completed"] as const;
// Default list excludes completed — the operator cares about in-flight and
// problem jobs; completed is available behind an explicit filter.
const OPERATIONAL = ["queued", "running", "failed", "requires_review"];

const LIST_FIELDS =
  "id, job_type, status, attempts, max_attempts, priority, run_at, lease_until, locked_by, " +
  "last_error, last_error_at, started_at, completed_at, created_at, updated_at, payload";

export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status"); // one of ALL_STATUSES, or null/"all"
  const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 500);

  // Per-status counts for the summary tiles (cheap head counts, in parallel).
  const countEntries = await Promise.all(
    ALL_STATUSES.map(async (s) => {
      const { count } = await supabaseAdmin
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", s);
      return [s, count ?? 0] as const;
    })
  );
  const counts = Object.fromEntries(countEntries) as Record<(typeof ALL_STATUSES)[number], number>;

  // The list: a single status, or the operational set (default). Newest activity
  // first so freshly-failed / freshly-queued work surfaces at the top.
  let query = supabaseAdmin.from("jobs").select(LIST_FIELDS).order("updated_at", { ascending: false }).limit(limit);
  if (statusFilter && (ALL_STATUSES as readonly string[]).includes(statusFilter)) {
    query = query.eq("status", statusFilter);
  } else {
    query = query.in("status", OPERATIONAL);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: { counts, jobs: data ?? [] } });
}
