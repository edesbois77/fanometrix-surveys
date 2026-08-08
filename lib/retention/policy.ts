// ORG-005 · IW-10 — Privacy, Minimisation & Retention: the retention MECHANISM.
//
// Governed by Q-32/CV-05 and Programme Plan IW-10 (F050 retention/pruning). This
// is the NON-DESTRUCTIVE, PARAMETERISED retention mechanism only:
//   • it computes the cutoff + classifies which records are past a retention
//     window, and offers a READ-ONLY preview (count of what WOULD be pruned);
//   • it performs NO deletion — destructive pruning (F050) is DEFERRED and is not
//     wired here (no scheduled job executes it);
//   • the concrete retention WINDOWS (which tables, how long) are a RESERVED
//     retention-scope / programme-priority decision (telemetry-retention-priority:
//     survey_events ≈ 98% of the DB, pruning deferred, scope agreed) and are NOT
//     decided here — a RetentionPolicy is supplied by governance, never defaulted.
//
// The minimisation core (F049 — no domain duplication, no IP/geo) is RETAINED and
// unaffected: this module reads only timestamps/ids for counting, never content.

import { supabaseAdmin } from "@/lib/supabase-admin";

/** A governance-supplied retention policy. `retentionDays` is a SCOPE decision —
 *  this module never defaults it. */
export interface RetentionPolicy {
  table: string;            // e.g. "survey_events"
  timestampColumn: string;  // the column that governs record age (e.g. "created_at")
  retentionDays: number;    // the window — supplied by the retention-scope decision
}

/** The cutoff ISO timestamp: records older than this are past the window. Pure. */
export function retentionCutoffIso(nowMs: number, retentionDays: number): string {
  return new Date(nowMs - retentionDays * 86_400_000).toISOString();
}

/** Whether a record's timestamp is past the cutoff (i.e. prunable). Pure. */
export function isPrunable(recordIso: string, cutoffIso: string): boolean {
  return recordIso < cutoffIso;
}

/**
 * READ-ONLY preview — count how many rows in `policy.table` are past the window,
 * WITHOUT deleting anything. This is the safe, non-destructive face of the
 * mechanism (an operator/governance tool to size an eventual, separately
 * authorised pruning). It never mutates. Returns the cutoff + count.
 */
export async function retentionPreview(policy: RetentionPolicy, nowMs: number): Promise<{ table: string; cutoffIso: string; prunable: number }> {
  const cutoffIso = retentionCutoffIso(nowMs, policy.retentionDays);
  const { count } = await supabaseAdmin
    .from(policy.table)
    .select("*", { count: "exact", head: true })
    .lt(policy.timestampColumn, cutoffIso);
  return { table: policy.table, cutoffIso, prunable: count ?? 0 };
}

/**
 * DESTRUCTIVE pruning is DEFERRED (F050). This placeholder documents the boundary
 * and is intentionally inert: it performs no deletion and must not be wired to any
 * scheduler until (a) the retention-scope decision sets the windows and (b) the
 * destructive-operation authority is granted. Calling it is a no-op that reports
 * the deferral rather than deleting.
 */
export function executeRetentionPruneDeferred(): { executed: false; reason: string } {
  return { executed: false, reason: "F050 destructive pruning is deferred pending retention-scope + destructive-operation authority" };
}
