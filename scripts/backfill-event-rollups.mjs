// Backfill event_agg_hourly / event_agg_daily from survey_events, then advance
// the watermark so the dashboard starts trusting the rollups.
//
// Requires migration 136. Safe to re-run at any time: both rollup functions
// replace whole windows rather than incrementing, so a second run produces
// exactly the same result as the first.
//
//   node scripts/backfill-event-rollups.mjs [--from ISO] [--to ISO] [--lag-hours N]
//
// Chunks hourly so each call stays well inside the API statement timeout. A day
// of raw events is ~500k rows; an hour is ~20k.
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) { console.error("Missing Supabase env"); process.exit(1); }

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const LAG_HOURS = Number(arg("--lag-hours", "1"));

async function rest(path, init = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const rpc = (fn, args) => rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });

const floorHour = d => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours()));
const addHours = (d, n) => new Date(d.getTime() + n * 3600e3);

(async () => {
  // Range: oldest raw event (or --from) to now minus the sealing lag.
  let from = arg("--from");
  if (!from) {
    const rows = await rest("survey_events?select=created_at&order=created_at.asc&limit=1");
    if (!rows.length) { console.log("No events to roll up."); return; }
    from = rows[0].created_at;
  }
  const to = arg("--to") ? new Date(arg("--to")) : addHours(floorHour(new Date()), -LAG_HOURS);
  let cursor = floorHour(new Date(from));

  const totalHours = Math.max(0, Math.ceil((to - cursor) / 3600e3));
  console.log(`Rolling up ${totalHours} hourly buckets`);
  console.log(`  from ${cursor.toISOString()}`);
  console.log(`  to   ${to.toISOString()}  (sealing lag ${LAG_HOURS}h)\n`);

  let done = 0, written = 0, slowest = 0;
  const started = Date.now();

  while (cursor < to) {
    const next = addHours(cursor, 1);
    const t0 = Date.now();
    const rows = await rpc("rollup_events_hourly", {
      p_from: cursor.toISOString(),
      p_to: next.toISOString(),
    });
    const ms = Date.now() - t0;
    slowest = Math.max(slowest, ms);
    written += Number(rows) || 0;
    done++;
    if (done % 24 === 0 || done === totalHours) {
      const pct = ((done / totalHours) * 100).toFixed(0);
      const eta = Math.round(((Date.now() - started) / done) * (totalHours - done) / 1000);
      process.stdout.write(`  ${String(pct).padStart(3)}%  ${done}/${totalHours} buckets  ${written.toLocaleString()} rows  slowest ${slowest}ms  eta ${eta}s\n`);
    }
    cursor = next;
  }

  console.log(`\nHourly done: ${written.toLocaleString()} rows in ${Math.round((Date.now() - started) / 1000)}s`);

  // Daily is derived from hourly in one pass over the whole range.
  const t0 = Date.now();
  const dailyRows = await rpc("rollup_events_daily", {
    p_from: new Date(from).toISOString(),
    p_to: to.toISOString(),
  });
  console.log(`Daily done:  ${Number(dailyRows).toLocaleString()} rows in ${Date.now() - t0}ms`);

  // Advance the watermark last. Until this moves, the query layer reads
  // everything from raw, so a partial backfill can never under-report.
  await rest("rollup_watermark?rollup_name=eq.event_agg", {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ sealed_through: to.toISOString(), updated_at: new Date().toISOString() }),
  });
  console.log(`Watermark advanced to ${to.toISOString()}`);
})().catch(e => { console.error("\nFAILED:", e.message); process.exit(1); });
