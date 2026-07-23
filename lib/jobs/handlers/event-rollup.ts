// Keeps event_agg_hourly / event_agg_daily current, and advances the watermark
// that tells the dashboard how much history it can trust.
//
// Without this the watermark never moves, the "unsealed tail" the query layer
// reads from raw grows without bound, and within days the dashboard is back to
// counting hundreds of thousands of raw rows per load. The rollup is only a fix
// while something keeps it fresh.
//
// Self-perpetuating: each run schedules the next. The framework owns claiming,
// leasing, retries and recovery; this handler owns only what to roll up.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { registerHandler } from "@/lib/jobs/registry";
import { enqueueJob } from "@/lib/jobs/enqueue";
import type { JobContext } from "@/lib/jobs/types";

export const EVENT_ROLLUP_JOB = "event-rollup";

/** How often the rollup refreshes. */
const INTERVAL_MINUTES = 5;

/** How far behind "now" an hour must be before it is sealed. An event can carry
 *  created_at = T but only become visible to a reader after its transaction
 *  commits, so sealing right up to the current instant would silently drop the
 *  stragglers. Comfortably longer than any plausible ingest transaction. */
const SEALING_LAG_HOURS = 1;

/** Hours re-derived on every run, on top of anything new. Combined with whole-
 *  bucket replacement this is what makes the pipeline self-healing: a straggler
 *  that landed after its bucket was sealed is absorbed on the next pass, with no
 *  manual repair and no reconciliation step. */
const TRAILING_HOURS = 3;

/** Ceiling on buckets per run, so recovering from a long outage is spread over
 *  several runs instead of one job that outlives its lease. */
const MAX_BUCKETS_PER_RUN = 48;

const HOUR_MS = 3_600_000;
const floorHour = (d: Date) => new Date(Math.floor(d.getTime() / HOUR_MS) * HOUR_MS);

/** Schedule the next run. Its own dedupe key is derived from the target time, so
 *  a double-enqueue collapses to one job while never colliding with the run that
 *  scheduled it. */
async function scheduleNext(delayMinutes = INTERVAL_MINUTES): Promise<void> {
  const runAt = new Date(Date.now() + delayMinutes * 60_000);
  await enqueueJob({
    type: EVENT_ROLLUP_JOB,
    runAt: runAt.toISOString(),
    dedupeKey: `${EVENT_ROLLUP_JOB}:${runAt.toISOString().slice(0, 16)}`,
  });
}

async function run(ctx: JobContext): Promise<void> {
  const { data: wmRow, error: wmErr } = await supabaseAdmin
    .from("rollup_watermark")
    .select("sealed_through")
    .eq("rollup_name", "event_agg")
    .single();
  if (wmErr) throw new Error(`watermark read failed: ${wmErr.message}`);

  const sealed = new Date(wmRow.sealed_through as string);
  const target = new Date(floorHour(new Date()).getTime() - SEALING_LAG_HOURS * HOUR_MS);

  // Re-derive the trailing window as well as anything new, and never move
  // backwards past the first event.
  let cursor = new Date(sealed.getTime() - TRAILING_HOURS * HOUR_MS);
  if (cursor > target) {
    ctx.log(`nothing to seal (watermark ${sealed.toISOString()}, target ${target.toISOString()})`);
    await scheduleNext();
    return;
  }

  const capped = new Date(Math.min(target.getTime(), cursor.getTime() + MAX_BUCKETS_PER_RUN * HOUR_MS));
  let buckets = 0;
  let rows = 0;

  while (cursor < capped) {
    const next = new Date(cursor.getTime() + HOUR_MS);
    const { data, error } = await supabaseAdmin.rpc("rollup_events_hourly", {
      p_from: cursor.toISOString(),
      p_to: next.toISOString(),
    });
    if (error) throw new Error(`hourly rollup ${cursor.toISOString()} failed: ${error.message}`);
    rows += Number(data) || 0;
    buckets++;
    cursor = next;
    // Long recoveries can outlive the default lease; keep it alive.
    if (buckets % 12 === 0) await ctx.heartbeat();
  }

  // Daily is derived from hourly, so it must follow, and it must cover every day
  // the hourly pass touched.
  const dailyFrom = new Date(sealed.getTime() - TRAILING_HOURS * HOUR_MS);
  const { error: dErr } = await supabaseAdmin.rpc("rollup_events_daily", {
    p_from: dailyFrom.toISOString(),
    p_to: capped.toISOString(),
  });
  if (dErr) throw new Error(`daily rollup failed: ${dErr.message}`);

  // Advance the watermark LAST. Until it moves the query layer reads that window
  // from raw, so a run that dies midway under-reports nothing: it just leaves
  // more work on the live side until the next pass.
  const { error: upErr } = await supabaseAdmin
    .from("rollup_watermark")
    .update({ sealed_through: capped.toISOString(), updated_at: new Date().toISOString() })
    .eq("rollup_name", "event_agg");
  if (upErr) throw new Error(`watermark update failed: ${upErr.message}`);

  ctx.log(`sealed ${buckets} hourly buckets (${rows} rows) through ${capped.toISOString()}`);

  // Still behind after hitting the cap: come straight back rather than idling.
  await scheduleNext(capped < target ? 0 : INTERVAL_MINUTES);
}

registerHandler(EVENT_ROLLUP_JOB, {
  run,
  // The chain must survive its own failures. Without this a single permanent
  // failure stops the rollup forever and the dashboard silently degrades back to
  // counting raw events as the unsealed tail grows.
  onOutcome: async (outcome) => {
    if (outcome === "failed" || outcome === "requires_review") {
      await scheduleNext(INTERVAL_MINUTES).catch(() => {/* next tick recovers */});
    }
  },
});
